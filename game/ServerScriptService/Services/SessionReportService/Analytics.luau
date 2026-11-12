--[[
	SessionReportService.Analytics (server): every session's full log sent as it happens to the game's own analytics
	backend (AnalyticsConfig.Url), where the dashboard shows each player, each session, a map of where things happened
	and the sessions worth watching (2026-11-11, the user: "un servidor propio ... que reciba todo de cada sesión ... que
	no genere lag").
	Nothing extra is watched here: SessionReportService's own log lines come through Line (each with where the player
	is, their cash, their speed) and Bump (the same line again). A session is held here and goes out ONCE, with its
	summary, when the player leaves (Finish; 2026-11-12, the user: "mandarlo cuando el jugador se sale y ya? asi seria
	menos escrituras, 1 por jugador"): the backend keeps it in one row, one write. A long one also goes every Every
	seconds (20 min), so a server going down loses at most that, and so does a session past 80% of what it may hold.
	Every Tick seconds the ones due go out in ONE gzip request for the whole server (MaxSessions, MaxLines a request).
	Signals: lines of kind 'señal' for things that look like the player struggling (clicks of rage, clicks on nothing,
	trying to get out of a window, a tutorial step taking long; from their client: walking away from the tutorial's goal,
	not moving while trying to, script errors). Each carries a weight; the dashboard ranks sessions by them.
	SATURATED: as the Discord report, every server stops while the backend fails or is slow (MemoryStore hashmap
	AnalyticsPause + MessagingService topic AnalyticsPause); lines wait in memory meanwhile, capped (MaxPending lines a
	session, MaxEnded sessions over), so a long outage can't grow the server's memory without end.
	Studio prints what each send cost (lines' time, encoding, bytes, sessions held).
--]]
local HttpService = game:GetService("HttpService")
local encoding: any = nil -- EncodingService (base64 in C++: a whole session's samples at once, no hitch)
pcall(function()
	encoding = game:GetService("EncodingService")
end)
local MemoryStoreService = game:GetService("MemoryStoreService")
local MessagingService = game:GetService("MessagingService")
local RunService = game:GetService("RunService")
local ServerScriptService = game:GetService("ServerScriptService")

local CONFIG = require(ServerScriptService.AnalyticsConfig)

local SIGNALS = CONFIG.Signals
local PAUSE = CONFIG.Pause
local STORE_NAME = "AnalyticsPause"
local STORE_KEY = "State"
local TOPIC = "AnalyticsPause"
local MPH_PER_STUD = 0.28 * 2.23693629 -- (as SessionReportService: DashConfig.MphPerSpeed)
local OUT_KEYS = { Escape = true, Backspace = true, ButtonB = true } -- keys and buttons that mean "get me out of here"
local CLIENT_SIGNALS = { trabado = true, alejo = true, error = true } -- the client's lines that are signals
local STUDIO = RunService:IsStudio()
local TRACK = CONFIG.Track
local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local B64_CHARS: { [number]: string } = {}
for index = 0, 63 do
	B64_CHARS[index] = string.sub(B64, index + 1, index + 1)
end

type Session = { [string]: any }

local Analytics = {}

local hooks: { [string]: any } = {}
local live: { [Session]: boolean } = {} -- sessions with something left to send
local serverId = if game.JobId ~= "" then game.JobId else HttpService:GenerateGUID(false)
local closing = false
local sending = false
local pauseMap: any = nil
local pausedUntil = 0 -- (0: not paused)
local localStrikes = 0
local probing = false
local lastLook = 0
local cost = { Lines = 0, Calls = 0, Samples = 0, SampleTime = 0 } -- (Studio: time spent since the last send)
local lastHeld = -1 -- (Studio: sessions held, printed when it changes: a leak would show as a count that never drops)

local function Now(): number
	return DateTime.now().UnixTimestamp
end

function Analytics.Enabled(): boolean
	if CONFIG.Url == "" or CONFIG.Key == "" then
		return false
	end
	return not STUDIO or workspace:GetAttribute(CONFIG.StudioAttribute) == true
end

-- The dashboard's page for a session (the Discord report links it)
function Analytics.Link(s: Session): string?
	if not s.Uid or CONFIG.Dashboard == "" then
		return nil
	end
	return `{CONFIG.Dashboard}/#/s/{s.Uid}`
end

--[[Lines]]
local function Where(s: Session): { number }?
	local part = if s.RideSince and s.Seat and s.Seat.Parent then s.Seat else s.Character and s.Character.PrimaryPart
	if not part then
		return nil
	end
	local at = part.Position
	return { math.round(at.X), math.round(at.Y), math.round(at.Z) }
end

local function Push(s: Session, item: { [string]: any })
	local out = s.Out
	table.insert(out, item)
	if #out > CONFIG.MaxPending then
		table.remove(out, 1)
		s.OutDropped += 1
	end
end

-- A line as the backend takes it
local function Clean(text: string): string
	if utf8.len(text) == nil then
		return (string.gsub(text, "[\128-\255]", "?"))
	end
	return text
end

local function Pack(item: { [string]: any }): { [string]: any }
	local entry = item.Update
	if entry then
		entry.UpdateQueued = nil
		return { q = entry.Seq, c = entry.Count }
	end
	entry = item.Entry
	local line: { [string]: any } = {
		q = entry.Seq,
		t = math.round(entry.At * 10) / 10,
		k = entry.Kind,
		s = Clean(entry.Text),
		c = entry.Count,
		p = item.P,
		m = item.M,
		v = item.V,
		f = item.F,
	}
	if entry.Tag then
		line.g = entry.Tag
		line.w = entry.Weight
		line.o = if entry.Target then Clean(entry.Target) else nil
	end
	return line
end

--[[Signals]]
local function Signal(s: Session, tag: string, weight: number, target: string?, text: string, entry: { [string]: any }?)
	local sig = s.Sig
	if sig.Count >= SIGNALS.Max then
		return
	end
	local key = `{tag}|{target or ""}`
	local now = os.clock()
	if sig.Last[key] and now - sig.Last[key] < SIGNALS.Repeat then
		return
	end
	sig.Last[key] = now
	sig.Count += 1
	if entry then
		-- (a line of the client's that is a signal itself: it becomes one, no second line)
		entry.Kind = "señal"
		entry.Text = text
	else
		entry = hooks.Log(s, "señal", text)
	end
	if entry then
		entry.Tag = tag
		entry.Weight = weight
		entry.Target = target
	end
end

-- What a click line was on: the UI's names ("Shop > Window > Buy"), without what it said
local function TargetOf(text: string): string
	local target = string.gsub(text, '%s*"[^"]*"$', "")
	target = string.gsub(target, "^sin botón, sobre ", "")
	target = string.gsub(target, "^A sobre ", "")
	return string.sub(target, 1, 80)
end

-- A click, tap, key or button while a window is open that isn't on it: trying to get out
local function TryingOut(s: Session, kind: string, text: string): boolean
	local window = s.Window
	if not window then
		return false
	end
	if kind == "tecla" or kind == "mando" then
		return OUT_KEYS[text] == true
	end
	if text == "en el mundo" then
		return true
	end
	return string.find(text, "^sin botón, sobre") ~= nil and not string.find(text, window, 1, true)
end

local function OnLine(s: Session, entry: { [string]: any })
	local kind, text = entry.Kind, entry.Text
	local sig = s.Sig
	if CLIENT_SIGNALS[kind] then
		if kind == "alejo" then
			local _, version, step, name = hooks.Tutorial(s)
			local where = if step then ` (tutorial {version}, paso {name})` else ""
			Signal(s, "alejo", SIGNALS.Away, if step then `Tutorial {version} · paso {step}` else "Fuera del tutorial", text .. where, entry)
		elseif kind == "trabado" then
			local at = Where(s)
			local near = if at then `cerca de ({at[1] // 100 * 100}, {at[3] // 100 * 100})` else "?"
			Signal(s, "atasco", SIGNALS.Stuck, near, text, entry)
		elseif sig.Errors < SIGNALS.ErrorsMax then
			sig.Errors += 1
			local target = string.gsub(text, s.Name, "<jugador>")
			target = string.gsub(target, ":%d+:", ":")
			Signal(s, "error", SIGNALS.Error, string.sub(target, 1, 80), "Error de script: " .. text, entry)
		end
		return
	end
	if kind == "clic" or kind == "toque" or kind == "tecla" or kind == "mando" then
		if TryingOut(s, kind, text) then
			local now = os.clock()
			if sig.OutWindow ~= s.Window or now - sig.OutSince > SIGNALS.OutWindow then
				sig.OutWindow, sig.OutSince, sig.OutCount, sig.OutKeys = s.Window, now, 0, 0
			end
			sig.OutCount += 1
			if kind == "tecla" or kind == "mando" then
				sig.OutKeys += 1
			end
			if sig.OutCount >= SIGNALS.OutClicks then
				local name = hooks.WindowName(s.Window)
				local clicks = sig.OutCount - sig.OutKeys
				local how = if sig.OutKeys > 0 then `{clicks} clics fuera y {sig.OutKeys} teclas de salir` else `{clicks} clics fuera`
				Signal(s, "cerrar", SIGNALS.StuckWindow, name, `No podía salir de {name}: {how} en {math.round(now - sig.OutSince)}s`)
				sig.OutCount, sig.OutKeys, sig.OutSince = 0, 0, now
			end
		end
	elseif kind == "ventana" and string.find(text, "^Cerró") and s.Window and s.WindowAt then
		-- (logged before the window changes: s.Window is still the one closing)
		local now = os.clock()
		if now - s.WindowAt <= SIGNALS.UTurnOpen then
			local list = sig.UTurns
			table.insert(list, now)
			while list[1] and now - list[1] > 60 do
				table.remove(list, 1)
			end
			if #list >= SIGNALS.UTurns then
				local name = hooks.WindowName(s.Window)
				Signal(s, "uturn", SIGNALS.UTurn, name, `Abrió y cerró {name} al instante {#list} veces en un minuto`)
				table.clear(list)
			end
		end
	end
end

-- Each new line of the session's log (SessionReportService's Log)
function Analytics.Line(s: Session, entry: { [string]: any })
	if not s.Out then
		return
	end
	local started = if STUDIO then os.clock() else 0
	local item: { [string]: any } = { Entry = entry, P = Where(s) }
	if s.Loaded then
		item.M = s.Cash
	end
	if s.RideSince and s.Seat and s.Seat.Parent then
		item.V = math.round(s.Seat.AssemblyLinearVelocity.Magnitude * MPH_PER_STUD)
	end
	if entry.Kind == "estado" and s.Pulse then
		item.F = s.Pulse.Fps
	end
	Push(s, item)
	if entry.Kind ~= "señal" then
		local ok, problem = pcall(OnLine, s, entry)
		if not ok then
			warn("[Analytics] signals:", problem)
		end
	end
	if STUDIO then
		cost.Lines += os.clock() - started
		cost.Calls += 1
	end
end

-- The same line again (counted on it) `when` seconds into the session: sent already, the new count goes too
function Analytics.Bump(s: Session, entry: { [string]: any }, when: number)
	if not s.Out then
		return
	end
	if entry.Sent and not entry.UpdateQueued then
		entry.UpdateQueued = true
		Push(s, { Update = entry })
	end
	local kind = entry.Kind
	if kind ~= "clic" and kind ~= "toque" then
		return
	end
	local text = entry.Text
	if string.find(text, "^sin botón, sobre") then
		if entry.Count == 2 and not s.Window then
			local target = TargetOf(text)
			Signal(s, "dead", SIGNALS.Dead, target, `Clics en algo que no es botón: {target}`)
		end
	elseif entry.Count == 3 and text ~= "en el mundo" then
		local target = TargetOf(text)
		Signal(s, "rage", SIGNALS.Rage, target, `Clics de rabia en {text} (3 en {math.max(1, math.round(when - entry.At))}s)`)
	end
end

--[[Phase 2: the replay's samples, binary (little-endian, as the web reads them)
	Track, one sample: u8 flags (1 riding, 2 absolute, 4 ragdolled), then
	  absolute: u32 ms since the session started, f32 x, y, z
	  else:     u16 ms since the last sample, i16 dx, dy, dz in tenths of a stud
	then u8 heading (0-255 = a full turn), u8 mph.
	Look, one piece per client packet: u32 ms since the session started, u8 count, then count × (u8 time since the
	last in 1/20 s, u8 camera heading, i8 camera pitch in degrees, u8 cursor x and y in 1/254 of the screen (255: none),
	u8 flags: 1 cursor shown, 2 touch).]]
local function Room(s: Session, field: string, lengthField: string, bytes: number, max: number): boolean
	local need = s[lengthField] + bytes
	local current: buffer = s[field]
	if need <= buffer.len(current) then
		return true
	end
	if need > max then
		return false -- (the backend's been away a while: sampling waits for it)
	end
	local bigger = buffer.create(math.min(max, math.max(need, buffer.len(current) * 2)))
	buffer.copy(bigger, 0, current, 0, s[lengthField])
	s[field] = bigger
	return true
end

local function Heading(look: Vector3): number
	return math.floor(((math.atan2(-look.X, -look.Z) / (2 * math.pi)) % 1) * 256) % 256
end

local function Sample(s: Session, nowMs: number)
	local part = if s.RideSince and s.Seat and s.Seat.Parent then s.Seat else s.Character and s.Character.PrimaryPart
	if not part then
		return
	end
	local cf = part.CFrame
	local at = cf.Position
	local flags = (if s.RideSince then 1 else 0) + (if s.Character and s.Character:GetAttribute("Ragdolled") == true then 4 else 0)
	local speed = math.min(255, math.round(part.AssemblyLinearVelocity.Magnitude * MPH_PER_STUD))
	local last = s.TrackLast
	local absolute = last == nil or s.TrackSince >= TRACK.Absolute or nowMs - last.T > 65000
	local dx, dy, dz = 0, 0, 0
	if not absolute then
		dx, dy, dz = math.round((at.X - last.X) * 10), math.round((at.Y - last.Y) * 10), math.round((at.Z - last.Z) * 10)
		absolute = math.abs(dx) > 32767 or math.abs(dy) > 32767 or math.abs(dz) > 32767
	end
	if not Room(s, "Track", "TrackLen", if absolute then 19 else 11, TRACK.MaxBytes) then
		return
	end
	local b: buffer = s.Track
	local o = s.TrackLen
	if absolute then
		buffer.writeu8(b, o, flags + 2)
		buffer.writeu32(b, o + 1, nowMs)
		buffer.writef32(b, o + 5, at.X)
		buffer.writef32(b, o + 9, at.Y)
		buffer.writef32(b, o + 13, at.Z)
		o += 17
		-- (what the reader will have, so the differences after it don't drift)
		s.TrackLast = { X = buffer.readf32(b, o - 12), Y = buffer.readf32(b, o - 8), Z = buffer.readf32(b, o - 4), T = nowMs }
		s.TrackSince = 0
	else
		buffer.writeu8(b, o, flags)
		buffer.writeu16(b, o + 1, math.clamp(nowMs - last.T, 0, 65535))
		buffer.writei16(b, o + 3, dx)
		buffer.writei16(b, o + 5, dy)
		buffer.writei16(b, o + 7, dz)
		o += 9
		last.X += dx / 10
		last.Y += dy / 10
		last.Z += dz / 10
		last.T = nowMs
		s.TrackSince += 1
	end
	buffer.writeu8(b, o, Heading(cf.LookVector))
	buffer.writeu8(b, o + 1, speed)
	s.TrackLen = o + 2
end

-- The client's camera and cursor (SessionReportService's Look remote; the size checked there): its time made the session's
function Analytics.Look(s: Session, packet: buffer)
	if not s.Look or s.Summary then
		return
	end
	local count = buffer.readu8(packet, 8)
	local bytes = count * 6
	if buffer.len(packet) < 9 + bytes or not Room(s, "Look", "LookLen", 5 + bytes, TRACK.LookMax) then
		return
	end
	local sent = buffer.readf64(packet, 0)
	local now = workspace:GetServerTimeNow()
	local startMs = math.round((math.clamp(sent, now - 30, now) - s.ServerStart) * 1000)
	local o = s.LookLen
	buffer.writeu32(s.Look, o, math.max(0, startMs))
	buffer.writeu8(s.Look, o + 4, count)
	buffer.copy(s.Look, o + 5, packet, 9, bytes)
	s.LookLen = o + 5 + bytes
end

-- The traffic and police round the player, from their client while riding (SessionReportService's Near remote, checked
-- there; 2026-11-12, the user: "pongas los carros de trafico, al menos los del carril que va el, y la policia tambien").
-- Kept as u32 ms since the session started (the packet's first sample), then the packet from its count on: u8 samples,
-- each u16 ms after the first, u8 cars, each u8 kind (0 traffic, 1 police), u8 id, i16 dx, i16 dz (half studs from the
-- player), u8 heading.
function Analytics.Near(s: Session, packet: buffer)
	if not s.Near or s.Summary then
		return
	end
	local bytes = buffer.len(packet) - 8
	if bytes < 1 or not Room(s, "Near", "NearLen", 4 + bytes, TRACK.NearMax) then
		return
	end
	local sent = buffer.readf64(packet, 0)
	local now = workspace:GetServerTimeNow()
	local o = s.NearLen
	buffer.writeu32(s.Near, o, math.max(0, math.round((math.clamp(sent, now - 30, now) - s.ServerStart) * 1000)))
	buffer.copy(s.Near, o + 4, packet, 8, bytes)
	s.NearLen = o + 4 + bytes
end

local function Base64(b: buffer, length: number): string
	if encoding then
		local ok, text = pcall(function()
			local part = buffer.create(length)
			buffer.copy(part, 0, b, 0, length)
			return buffer.tostring(encoding:Base64Encode(part))
		end)
		if ok then
			return text
		end
	end
	local out = table.create(math.ceil(length / 3))
	for i = 0, length - 1, 3 do
		local c1 = if i + 1 < length then buffer.readu8(b, i + 1) else 0
		local c2 = if i + 2 < length then buffer.readu8(b, i + 2) else 0
		local n = buffer.readu8(b, i) * 65536 + c1 * 256 + c2
		table.insert(out, B64_CHARS[n // 262144] .. B64_CHARS[(n // 4096) % 64]
			.. (if i + 1 < length then B64_CHARS[(n // 64) % 64] else "=") .. (if i + 2 < length then B64_CHARS[n % 64] else "="))
	end
	return table.concat(out)
end

-- `used` bytes of a session's buffer went out: the rest moves to the front
local function Shift(s: Session, field: string, lengthField: string, used: number)
	local rest = s[lengthField] - used
	if rest > 0 then
		buffer.copy(s[field], 0, s[field], used, rest)
	end
	s[lengthField] = rest
end

-- The share of new sessions recorded, as the backend's last answer said (sample): all of them while the day's writes
-- keep to their pace, fewer when they run ahead of it (D1's free plan writes 100,000 rows a day; 2026-11-11, ~100 CCU).
-- A session not drawn is never sent (no link in its Discord report either)
local sample = 1

-- A session starting (before its first line)
function Analytics.Begin(s: Session)
	if not Analytics.Enabled() then
		return
	end
	if not STUDIO and sample < 1 and math.random() >= sample then
		return
	end
	s.Uid = string.sub(string.lower((string.gsub(HttpService:GenerateGUID(false), "-", ""))), 1, 16)
	s.Out = {}
	s.OutSeq = 0
	s.OutDropped = 0
	s.SentAt = os.clock() -- (its first part goes when it ends, or Every seconds from now)
	s.Sig = { Count = 0, Last = {}, Errors = 0, UTurns = {}, OutCount = 0, OutKeys = 0, OutSince = 0 }
	s.Track, s.TrackLen, s.TrackSince = buffer.create(1024), 0, 0
	s.Look, s.LookLen = buffer.create(256), 0
	s.Near, s.NearLen = buffer.create(256), 0
	live[s] = true
end

-- A session let go without its summary (its ending failed): nothing of it is held any more
function Analytics.Forget(s: Session)
	live[s] = nil
	if s.Out then
		table.clear(s.Out)
	end
	s.Track, s.TrackLen, s.Look, s.LookLen, s.Near, s.NearLen = nil, 0, nil, 0, nil, 0
end

--[[Sending]]
local function Meta(s: Session): { [string]: any }
	-- (the tutorial step they're on now, for the dashboard's live funnel)
	local ok, inTutorial, version, step = pcall(hooks.Tutorial, s)
	return {
		first = if s.Loaded then s.First == true else nil,
		device = if s.Pulse then s.Pulse.Device else nil,
		dropped = if s.OutDropped > 0 then s.OutDropped else nil,
		tut = if ok and inTutorial then { v = version, s = step } else nil,
	}
end

local function RetryAfter(response: { [string]: any }): number?
	local header = response.Headers and (response.Headers["retry-after"] or response.Headers["Retry-After"])
	return tonumber(header)
end

-- One request: "Ok", "Slow" (through, but too slow), "Saturated" (stop everywhere) or "Bad" (refused for what it says);
-- then why, the seconds it asked to wait, and (through) the backend's answer
local function Send(body: { [string]: any }): (string, string?, number?, string?)
	local test = if STUDIO then workspace:GetAttribute(CONFIG.TestStatus) else nil
	if type(test) == "number" then
		warn(`[Analytics] Studio: answering as if the backend had said {test}`)
		return if test >= 200 and test < 300 then "Ok" else "Saturated", `HTTP {test}`, nil
	end
	local encodeStart = os.clock()
	local encoded, json = pcall(HttpService.JSONEncode, HttpService, body)
	local encodeTook = os.clock() - encodeStart
	if not encoded then
		warn("[Analytics] couldn't encode:", json)
		return "Bad", "encode", nil
	end
	local started = os.clock()
	local answered, response = pcall(HttpService.RequestAsync, HttpService, {
		Url = CONFIG.Url .. "/ingest",
		Method = "POST",
		Headers = { ["Content-Type"] = "application/json", ["X-Key"] = CONFIG.Key },
		Body = json,
		Compress = Enum.HttpCompression.Gzip,
	})
	local took = os.clock() - started
	if STUDIO then
		local held = 0
		for _ in live do
			held += 1
		end
		print(
			`[Analytics] Studio: {#body.sessions} sessions, {#json} bytes, encoded in {math.round(encodeTook * 1e5) / 100} ms; `
				.. `lines since last send: {cost.Calls} in {math.round(cost.Lines * 1e5) / 100} ms; `
				.. `samples: {cost.Samples} in {math.round(cost.SampleTime * 1e5) / 100} ms; `
				.. `answered {if answered then response.StatusCode else "nothing"} in {math.round(took * 100) / 100}s; {held} sessions held`
		)
		cost.Lines, cost.Calls, cost.Samples, cost.SampleTime = 0, 0, 0, 0
	end
	if not answered then
		warn("[Analytics] no answer:", response)
		return "Saturated", "sin respuesta", nil
	end
	if response.Success then
		return if took >= CONFIG.Slow then "Slow" else "Ok", `tardó {math.round(took)}s`, nil, response.Body
	end
	local status = response.StatusCode
	if status == 429 or status >= 500 or status == 401 or status == 403 or status == 404 then
		return "Saturated", `HTTP {status}`, RetryAfter(response)
	end
	warn(`[Analytics] the backend refused a send: {status}`, string.sub(response.Body, 1, 300))
	return "Bad", `HTTP {status}`, nil
end

local function PauseLength(strikes: number, retryAfter: number?): number
	local length = math.min(PAUSE.Base * 2 ^ (strikes - 1), PAUSE.Max)
	local test = if STUDIO then workspace:GetAttribute(CONFIG.TestPause) else nil
	if type(test) == "number" then
		length = test
	end
	return math.max(length, retryAfter or 0)
end

local function Publish(message: { [string]: any })
	pcall(MessagingService.PublishAsync, MessagingService, TOPIC, message)
end

-- Saturated: this server and every other stop (the first to say so sets how long)
local function Trip(why: string, retryAfter: number?)
	local now = Now()
	localStrikes += 1
	local untilTime = now + PauseLength(localStrikes, retryAfter)
	if pauseMap then
		local wasProbing = probing
		local ok, state = pcall(function()
			return pauseMap:UpdateAsync(STORE_KEY, function(old: any)
				if type(old) == "table" and old.Until > now and not wasProbing then
					return nil
				end
				local strikes = (if type(old) == "table" then old.Strikes or 0 else 0) + 1
				return {
					Since = if type(old) == "table" then old.Since else now,
					Until = now + PauseLength(strikes, retryAfter),
					Why = why,
					Strikes = strikes,
				}
			end, PAUSE.Expiry)
		end)
		if ok and type(state) == "table" then
			untilTime = state.Until
		elseif ok then
			local read, current = pcall(pauseMap.GetAsync, pauseMap, STORE_KEY)
			if read and type(current) == "table" then
				untilTime = current.Until
			end
		end
	end
	probing = false
	pausedUntil = untilTime
	warn(`[Analytics] saturated ({why}): every server stops sending for {untilTime - now}s`)
	Publish({ Until = untilTime })
end

-- The pause is over and this send went through: everyone starts again
local function Clear()
	if pausedUntil == 0 and not probing then
		localStrikes = 0
		return
	end
	if pauseMap then
		pcall(pauseMap.RemoveAsync, pauseMap, STORE_KEY)
	end
	pausedUntil, probing, localStrikes = 0, false, 0
	Publish({ Clear = true })
	print("[Analytics] the backend takes sends again")
end

-- Whether this server gets the try once the pause is over (one at a time)
local function ClaimTry(): boolean
	if not pauseMap then
		return true
	end
	local now = Now()
	local ok, state = pcall(function()
		return pauseMap:UpdateAsync(STORE_KEY, function(old: any)
			if type(old) ~= "table" or now < old.Until or (old.TryAt and now - old.TryAt < PAUSE.ProbeHold) then
				return nil
			end
			old.Try = serverId
			old.TryAt = now
			return old
		end, PAUSE.Expiry)
	end)
	if not ok then
		return true
	end
	if state == nil then
		-- gone (cleared by another server) or someone else trying
		local read, current = pcall(pauseMap.GetAsync, pauseMap, STORE_KEY)
		if read and current == nil then
			pausedUntil = 0
			return true
		end
		return false
	end
	return type(state) == "table" and state.Try == serverId
end

-- Whether sends may go out now
local function Open(): boolean
	local now = Now()
	if pausedUntil > 0 then
		if now < pausedUntil then
			return false
		end
		if ClaimTry() then
			probing = pausedUntil > 0
			return true
		end
		pausedUntil = now + 10
		return false
	end
	if pauseMap and now - lastLook >= PAUSE.Look then
		-- (another server may have paused it: a MessagingService message can be lost)
		lastLook = now
		local ok, state = pcall(pauseMap.GetAsync, pauseMap, STORE_KEY)
		if ok and type(state) == "table" and type(state.Until) == "number" then
			pausedUntil = state.Until
			return false
		end
	end
	return true
end

local function Due(s: Session, now: number, force: boolean): boolean
	if s.Summary then
		return true
	end
	if #s.Out == 0 and (s.TrackLen or 0) == 0 then
		return false
	end
	-- (a session near what it may hold goes early: its oldest lines would start to go)
	return force or closing or now - s.SentAt >= CONFIG.Every or #s.Out >= CONFIG.MaxPending * 0.8
end

-- One request with every session that's due
local function Flush(force: boolean)
	if sending or not Open() then
		return
	end
	local now = os.clock()
	local batch, taken, total = {}, {}, 0
	for s in live do
		if total >= CONFIG.MaxLines or #batch >= CONFIG.MaxSessions then
			break
		end
		if Due(s, now, force) then
			local count = math.min(#s.Out, CONFIG.MaxLines - total)
			local lines = table.create(count)
			for index = 1, count do
				local item = s.Out[index]
				lines[index] = Pack(item)
				if item.Entry then
					item.Entry.Sent = true -- (a count on it from now goes as an update)
				end
			end
			total += count
			local ends = s.Summary ~= nil and count == #s.Out
			local trackUsed, lookUsed, nearUsed = s.TrackLen or 0, s.LookLen or 0, s.NearLen or 0
			table.insert(batch, {
				track = if trackUsed > 0 then Base64(s.Track, trackUsed) else nil,
				look = if lookUsed > 0 then Base64(s.Look, lookUsed) else nil,
				near = if nearUsed > 0 then Base64(s.Near, nearUsed) else nil,
				id = s.Uid,
				user = s.Id,
				name = s.Name,
				display = s.Display,
				start = s.ServerStart,
				seq = s.OutSeq + 1,
				meta = Meta(s),
				lines = lines,
				["end"] = if ends then s.Summary else nil,
			})
			table.insert(taken, { S = s, Count = count, Ends = ends, Track = trackUsed, Look = lookUsed, Near = nearUsed })
		end
	end
	if #batch == 0 then
		return
	end
	sending = true
	local ok, result, why, retryAfter, answer = pcall(Send, {
		v = 2,
		server = serverId,
		place = game.PlaceId,
		version = game.PlaceVersion,
		studio = STUDIO,
		private = game.PrivateServerId ~= "",
		sent = DateTime.now().UnixTimestampMillis / 1000,
		sessions = batch,
	})
	sending = false
	if not ok then
		warn("[Analytics] sending:", result)
		result = "Saturated"
	end
	if result == "Saturated" then
		-- nothing went: it all waits (the counts already taken go again as they are)
		for _, take in taken do
			for index = 1, take.Count do
				local item = take.S.Out[index]
				if item and item.Entry then
					item.Entry.Sent = nil
				end
			end
		end
		Trip(why or "sin respuesta", retryAfter)
		return
	end
	-- through (or refused for what it said: not sent again, it would be refused again)
	for _, take in taken do
		local s = take.S
		local out = s.Out
		local rest = #out - take.Count
		table.move(out, take.Count + 1, #out, 1)
		for index = #out, rest + 1, -1 do
			out[index] = nil
		end
		s.OutSeq += 1
		s.SentAt = os.clock()
		if s.Track then
			Shift(s, "Track", "TrackLen", take.Track)
			Shift(s, "Look", "LookLen", take.Look)
			if s.Near then
				Shift(s, "Near", "NearLen", take.Near)
			end
		end
		if take.Ends then
			live[s] = nil
			s.Track, s.Look, s.Near = nil, nil, nil
		end
	end
	-- a player past the plays kept (the backend's MAX_PLAYS): their session is let go, nothing more of it is sent
	local decoded, reply = pcall(HttpService.JSONDecode, HttpService, answer or "")
	if decoded and type(reply) == "table" and type(reply.sample) == "number" then
		sample = math.clamp(reply.sample, 0, 1)
	end
	if decoded and type(reply) == "table" and type(reply.skip) == "table" and #reply.skip > 0 then
		local skip = {}
		for _, id in reply.skip do
			skip[id] = true
		end
		for _, take in taken do
			local s = take.S
			if skip[s.Uid] then
				Analytics.Forget(s)
				s.Out, s.Uid = nil, nil -- (no more lines, no link in the Discord report)
			end
		end
	end
	if result == "Slow" then
		Trip(why or "lento", nil)
	elseif result == "Ok" then
		Clear()
	end
end

local function SafeFlush(force: boolean)
	local ok, problem = pcall(Flush, force)
	if not ok then
		sending = false
		warn("[Analytics] flush:", problem)
	end
end

-- A long time on one tutorial step: a signal once per step
local function Look(s: Session)
	if s.Summary then
		return
	end
	local inTutorial, version, step, name = hooks.Tutorial(s)
	if not inTutorial then
		return
	end
	local sig = s.Sig
	if sig.SlowStep ~= step and os.clock() - (s.StepAt or s.Started) >= SIGNALS.SlowAfter then
		sig.SlowStep = step
		Signal(s, "lento", SIGNALS.SlowStep, `Tutorial {version} · paso {step}`, `Lleva {hooks.Time(os.clock() - (s.StepAt or s.Started))} en el paso {name}`)
	end
end

-- The session's over: its summary goes with its last lines, right away
function Analytics.Finish(s: Session, summary: { [string]: any })
	if not s.Out then
		return
	end
	s.Summary = summary
	-- (the backend down a long while: only the newest MaxEnded sessions over wait for it)
	local ended = {}
	for other in live do
		if other.Summary then
			table.insert(ended, other)
		end
	end
	if #ended > CONFIG.MaxEnded then
		table.sort(ended, function(a, b)
			return (a.Ended or 0) < (b.Ended or 0)
		end)
		for index = 1, #ended - CONFIG.MaxEnded do
			Analytics.Forget(ended[index])
		end
	end
	task.defer(SafeFlush, false)
end

function Analytics.Start(given: { [string]: any })
	hooks = given
	if not Analytics.Enabled() then
		return
	end
	local ok, map = pcall(function()
		return MemoryStoreService:GetHashMap(STORE_NAME)
	end)
	pauseMap = if ok then map else nil
	task.spawn(function()
		pcall(function()
			MessagingService:SubscribeAsync(TOPIC, function(message: any)
				local data = message.Data
				if type(data) ~= "table" then
					return
				end
				if data.Clear then
					pausedUntil, localStrikes = 0, 0
				elseif type(data.Until) == "number" then
					pausedUntil = math.max(pausedUntil, data.Until)
				end
			end)
		end)
	end)
	-- the replay's samples: one loop for every player on the server (a few property reads and buffer writes each)
	task.spawn(function()
		while true do
			task.wait(TRACK.Every)
			local started = if STUDIO then os.clock() else 0
			for s in live do
				if s.Track and not s.Summary then
					local nowMs = math.round((workspace:GetServerTimeNow() - s.ServerStart) * 1000)
					local fine, problem = pcall(Sample, s, nowMs)
					if not fine then
						warn("[Analytics] sample:", problem)
					end
					if STUDIO then
						cost.Samples += 1
					end
				end
			end
			if STUDIO then
				cost.SampleTime += os.clock() - started
			end
		end
	end)
	task.spawn(function()
		while true do
			task.wait(CONFIG.Tick)
			for s in live do
				local fine, problem = pcall(Look, s)
				if not fine then
					warn("[Analytics] look:", problem)
				end
			end
			SafeFlush(false)
			if STUDIO then
				local held = 0
				for _ in live do
					held += 1
				end
				if held ~= lastHeld then
					lastHeld = held
					print(`[Analytics] Studio: sessions held now {held}`)
				end
			end
		end
	end)
	game:BindToClose(function()
		closing = true
		local deadline = os.clock() + CONFIG.CloseWait
		task.wait(0.6) -- (the sessions' own Finish comes FINISH_DELAY after they leave)
		while next(live) ~= nil and os.clock() < deadline do
			if pausedUntil > Now() then
				break
			end
			SafeFlush(true)
			task.wait(0.3)
		end
	end)
end

return Analytics
