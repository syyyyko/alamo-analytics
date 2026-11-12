--[[
	SessionReportService (server): a message on Discord for every player who leaves, the moment they do, to see why
	people go without waiting for the funnels (2026-11-09, the user: "mandarme al discord la informacion del jugador que
	se sale ... quiero mirar en tiempo real cuando se salga porque se salieron ... masomenos para darme una idea").
	Their first time (green) tells the tutorial: which one, finished or where they dropped. Back again (orange) it doesn't,
	and tells their progress instead. Both: how long, a likely reason (Reasons: rules with a weight, the heaviest is the
	headline), money made and spent, what they bought or tried to buy, the store and Robux, friends in the server and the
	last things they did.
	What's seen here is the server's own (their data, the seat, crashes); what only their client knows (the window open,
	no input for a while, the main menu, FPS) comes from Controllers.SessionReportController. A client can only spoil
	its own message: names of windows are checked, nothing it sends is written as it came.
	The buying is watched from here (Watch wraps each service's method), not written into every service, and a mistake in
	a watcher can't touch the purchase: it runs after it, in a pcall.
	SATURATED (2026-11-09, the user: "si no responde o esta mandando errores de que esta suturado dejas de intentar
	mandar en todos los server y se esperan un tiempo, y ya que funcione mandas un mensaje de que se pauso por
	saturamiento"): the pause is one state in a MemoryStore every server reads before sending, told at once through
	MessagingService. While it lasts reports aren't sent, only counted. When it's over one server (a lease in the same
	state) sends the notice of the pause: through, everyone starts again; not, a longer pause.
	Numbers and the webhook: ServerScriptService.SessionReportConfig. Studio sends nothing unless the Workspace attribute
	SessionReportTest is true.
--]]
local HttpService = game:GetService("HttpService")
local MarketplaceService = game:GetService("MarketplaceService")
local MemoryStoreService = game:GetService("MemoryStoreService")
local MessagingService = game:GetService("MessagingService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local ServerScriptService = game:GetService("ServerScriptService")

local Nexus = require(ReplicatedStorage.Packages.Nexus)
local CustomizationConfig = require(ReplicatedStorage.Shared.CustomizationConfig)
local DealershipConfig = require(ReplicatedStorage.Shared.DealershipConfig)
local EquipmentConfig = require(ReplicatedStorage.Shared.EquipmentConfig)
local HelmetConfig = require(ReplicatedStorage.Shared.HelmetConfig)
local ModeConfig = require(ReplicatedStorage.Shared.ModeConfig)
local QuestConfig = require(ReplicatedStorage.Shared.QuestConfig)
local ScoreConfig = require(ReplicatedStorage.Shared.ScoreConfig)
local ShopConfig = require(ReplicatedStorage.Shared.ShopConfig)
local TrickConfig = require(ReplicatedStorage.Shared.TrickConfig)
local TutorialConfig = require(ReplicatedStorage.Shared.TutorialConfig)
local CONFIG = require(ServerScriptService.SessionReportConfig)
local Analytics = require(script.Analytics) -- (the same sessions, streamed to the game's own backend: AnalyticsConfig)

local LIMITS = CONFIG.Limits
local PAUSE = CONFIG.Pause
local STORE_NAME = "SessionReportPause"
local STORE_KEY = "State"
local TOPIC = "SessionReportPause"
local VEHICLES_PATH = "Garage.Vehicles."
local MAX_CRASH_TIMES = 30 -- crashes remembered (only the last few minutes' are read)
local MPH_PER_STUD = 0.28 * 2.23693629 -- (A-Chassis' 280 mm a stud, as the dash counts it: DashConfig.MphPerSpeed)
local MAX_LOG = 2500 -- lines of a session's full log kept (the oldest go first, LOG_TRIM at a time)
local LOG_TRIM = 300
local STATUS_EVERY = 30 -- seconds: a status line in the full log at least this often, and whenever it changes
local TRAIL_KINDS = { tecla = true, mando = true, clic = true, toque = true, prompt = true, error = true, trabado = true, alejo = true }
local FINISH_DELAY = 0.25 -- seconds after PlayerRemoving: DataService's Leaving has been by then, whichever went first

local WHY = {
	Poor = "sin dinero",
	Cash = "sin dinero",
	Level = "sin nivel",
	Order = "falta la mejora anterior",
	Pass = "sin pase",
}
local DEVICES = { PC = "PC", Phone = "Celular", Tablet = "Tablet", Console = "Consola" }
local PULSE_NUMBERS = { "Idle", "Afk", "Clicks", "Fps" }
local PULSE_FLAGS = { "Menu", "Cinematic", "Watching", "RaceGarage", "Focused", "Teleporting" }

type Session = { [string]: any }

local function IsWindow(name: any): boolean
	return name == nil or (type(name) == "string" and #name <= 32 and string.match(name, "^[%w_]+$") ~= nil)
end

local function IsPulse(pulse: any): boolean
	if type(pulse) ~= "table" or DEVICES[pulse.Device] == nil then
		return false
	end
	for _, key in PULSE_NUMBERS do
		local value = pulse[key]
		if type(value) ~= "number" or value ~= value or value < 0 or value > 1e7 then
			return false
		end
	end
	for _, key in PULSE_FLAGS do
		if type(pulse[key]) ~= "boolean" then
			return false
		end
	end
	return true
end

-- Keys, buttons and clicks from a player's client: { { T = server time, K = one of TRAIL_KINDS, X = what } }
local function IsTrail(list: any): boolean
	if type(list) ~= "table" then
		return false
	end
	local count = 0
	for index, entry in list do
		count += 1
		if type(index) ~= "number" or count > 40 or type(entry) ~= "table" then
			return false
		end
		if type(entry.T) ~= "number" or entry.T ~= entry.T or math.abs(entry.T) > 1e11 then
			return false
		end
		if not TRAIL_KINDS[entry.K] or type(entry.X) ~= "string" or #entry.X > 240 then
			return false
		end
	end
	return count > 0
end

-- The client's camera and cursor for the replay (Analytics.Look): f64 time, u8 count, count × 6 bytes
local LOOK_MAX = 24
local function IsLook(packet: any): boolean
	if typeof(packet) ~= "buffer" then
		return false
	end
	local length = buffer.len(packet)
	return length >= 15 and length <= 9 + 6 * LOOK_MAX and (length - 9) % 6 == 0 and buffer.readu8(packet, 8) * 6 == length - 9
end

-- The traffic and police round the client while riding (Analytics.Near): f64 time, u8 samples, each u16 ms, u8 cars,
-- cars × 7 bytes; walked here so the backend can walk it too
local NEAR_SAMPLES, NEAR_CARS = 12, 8
local function IsNear(packet: any): boolean
	if typeof(packet) ~= "buffer" then
		return false
	end
	local length = buffer.len(packet)
	if length < 12 or length > 9 + NEAR_SAMPLES * (3 + 7 * NEAR_CARS) then
		return false
	end
	local samples = buffer.readu8(packet, 8)
	if samples < 1 or samples > NEAR_SAMPLES then
		return false
	end
	local o = 9
	for _ = 1, samples do
		if o + 3 > length then
			return false
		end
		local cars = buffer.readu8(packet, o + 2)
		if cars > NEAR_CARS then
			return false
		end
		o += 3 + cars * 7
	end
	return o == length
end

local SessionReportService = {
	Client = {
		-- client -> server: (packet) the police and cars round it while riding, 2 a second, every 5 s (Analytics.Near)
		Near = Nexus.Event({ Args = { IsNear }, Rate = 1, Burst = 3 }),
		-- client -> server: (packet) its camera and cursor, 2 a second, every 5 s (the analytics replay; Analytics.Look)
		Look = Nexus.Event({ Args = { IsLook }, Rate = 1, Burst = 3 }),
		-- client -> server: (window name or nil) the window open now
		Window = Nexus.Event({ Args = { IsWindow }, Rate = 5, Burst = 20 }),
		-- client -> server: ({ Idle, Afk, Clicks, Fps, Menu, Cinematic, Watching, RaceGarage, Focused, Teleporting, Device })
		Pulse = Nexus.Event({ Args = { IsPulse }, Rate = 2, Burst = 8 }),
		-- client -> server: ("Lives" | an EQUIPMENT section | "Trick", id, why) a purchase its window didn't even ask for
		Tried = Nexus.Event({ Args = { "string", "string", "string" }, Rate = 2, Burst = 6 }),
		-- client -> server: (trail) its keys, gamepad buttons, clicks and prompts since the last batch (the full log's)
		Trail = Nexus.Event({ Args = { IsTrail }, Rate = 1, Burst = 4 }),
	},
}

local DataService, TutorialService
local sessions: { [Player]: Session } = {}
local closing = false
local finishing = 0 -- reports waiting for FINISH_DELAY
local products: { [number]: { Name: string, Robux: number, Cash: number? } } = {}
local passes: { [number]: { Name: string, Robux: number } } = {}

local function Enabled(): boolean
	return not RunService:IsStudio() or workspace:GetAttribute(CONFIG.StudioAttribute) == true
end

--[[Words]]
local function Time(seconds: number): string
	local whole = math.max(0, math.floor(seconds + 0.5))
	if whole < 60 then
		return `{whole}s`
	end
	local minutes = whole // 60
	if minutes < 60 then
		return `{minutes}m {whole % 60}s`
	end
	return `{minutes // 60}h {minutes % 60}m`
end

local function Stamp(seconds: number): string
	local whole = math.max(0, math.floor(seconds))
	return string.format("%d:%02d", whole // 60, whole % 60)
end

local function Money(amount: number): string
	local grouped = string.gsub(string.reverse(tostring(math.floor(math.abs(amount)))), "(%d%d%d)", "%1,")
	grouped = string.gsub(string.reverse(grouped), "^,", "")
	return "$" .. grouped
end

local function Times(count: number): string
	return if count == 1 then "1 vez" else `{count} veces`
end

-- No markdown out of a name
local function Clean(text: string): string
	return (string.gsub(text, "[%*_~`|>\\]", "\\%0"))
end

local function Cap(text: string, max: number): string
	if (utf8.len(text) or #text) <= max then
		return text
	end
	local cut = utf8.offset(text, max) or max
	return string.sub(text, 1, cut - 1) .. "…"
end

local function WindowName(name: string): string
	return CONFIG.Windows[name] or name
end

local function StepName(step: number, version: any): string
	local info = version.Steps[step]
	if not info then
		return `{step}/{version.Done - 1}`
	end
	local key = info.Name or info.Id
	local words = CONFIG.Steps[key]
	return `{step}/{version.Done - 1}: {words or key}`
end

--[[A session]]
local function New(player: Player): Session
	return {
		Player = player,
		Id = player.UserId,
		Name = player.Name,
		Display = player.DisplayName,
		Started = os.clock(),
		ServerStart = workspace:GetServerTimeNow(),
		Log = {},
		LogDropped = 0,
		LogSeq = 0,
		Events = {},
		Loaded = false,
		Earned = 0,
		Spent = 0,
		Robux = 0,
		RobuxCash = 0,
		RobuxBought = {},
		Receipts = {},
		CancelledList = {},
		RobuxTries = 0,
		Bought = {},
		BoughtIds = {},
		Received = {},
		TriedList = {},
		Windows = {},
		Friends = {},
		RideSeconds = 0,
		Mounts = 0,
		Spawns = 0,
		Crashes = 0,
		CrashTimes = {},
		Deaths = 0,
		HeartsLost = 0,
		Income = {},
		AdminCash = 0,
		Busted = 0,
		Escaped = 0,
		BestCombo = 0,
		Points = 0,
		FpsSum = 0,
		FpsCount = 0,
		Afk = false,
	}
end

-- A line in the full log (under the message): `at` seconds into the session by the server's clock (now if none); the same line
-- again within 3 s is counted on it. Each line also goes to the analytics backend (Analytics.Line / Bump); the line
-- made is handed back (nil: counted on the last one)
local function Log(s: Session, kind: string, text: string, at: number?): { [string]: any }?
	local when = at or (workspace:GetServerTimeNow() - s.ServerStart)
	local log = s.Log
	local last = log[#log]
	if last and last.Kind == kind and last.Text == text and math.abs(when - last.At) <= 3 then
		last.Count += 1
		Analytics.Bump(s, last, when)
		return nil
	end
	s.LogSeq += 1
	local entry = { At = when, Kind = kind, Text = text, Count = 1, Seq = s.LogSeq }
	table.insert(log, entry)
	Analytics.Line(s, entry)
	local count = #log
	if count > MAX_LOG then
		table.move(log, LOG_TRIM + 1, count, 1)
		for index = count - LOG_TRIM + 1, count do
			log[index] = nil
		end
		s.LogDropped += LOG_TRIM
	end
	return entry
end

-- What kind of line a Mark is, by how it starts
local KINDS = {
	{ "Abrió", "ventana" }, { "Tutorial", "tutorial" }, { "Terminó el tutorial", "tutorial" },
	{ "Se subió", "moto" }, { "Se bajó", "moto" }, { "Sacó la moto", "moto" }, { "Chocó", "moto" }, { "Murió", "moto" },
	{ "Compró", "compra" }, { "Cancel", "compra" }, { "Le dio a comprar", "compra" }, { "Quiso regalar", "compra" },
	{ "Se le ofreció", "compra" },
	{ "BUSTED", "policía" }, { "Escapó", "policía" }, { "Un radar", "policía" },
	{ "Entró su amigo", "amigos" }, { "Se fue su amigo", "amigos" },
	{ "Se quedó AFK", "afk" }, { "Volvió de AFK", "afk" }, { "Le dio a PLAY", "menú" }, { "Teleport", "teleport" },
}
local function KindOf(text: string): string
	for _, pair in KINDS do
		if string.sub(text, 1, #pair[1]) == pair[1] then
			return pair[2]
		end
	end
	return "juego"
end

-- One more thing they did: in the full log, and the last Timeline of them kept for the message (the same thing twice
-- running counted)
local function Mark(s: Session, text: string, kind: string?)
	Log(s, kind or KindOf(text), text)
	local events = s.Events
	local last = events[#events]
	local at = os.clock() - s.Started
	if last and last.Text == text then
		last.Count += 1
		last.At = at
		return
	end
	table.insert(events, { At = at, Text = text, Count = 1 })
	if #events > CONFIG.Timeline then
		table.remove(events, 1)
	end
end

local function Bought(s: Session, group: string, name: string, price: number, id: string?)
	table.insert(s.Bought, { Group = group, Name = name, Price = price })
	if id then
		s.BoughtIds[id] = true
	end
	Mark(s, `Compró {name}`)
end

local function Tried(s: Session, group: string, name: string, why: string, price: number?)
	local key = `{group}/{name}/{why}`
	local entry = s.TriedList[key]
	if entry then
		entry.Count += 1
	else
		entry = { Group = group, Name = name, Why = why, Price = price, Count = 1 }
		s.TriedList[key] = entry
	end
	entry.Cash = DataService:GetCash(s.Player)
	if why == "Poor" or why == "Cash" then
		s.LastPoor = { Name = name, At = os.clock() }
	end
	Mark(s, `{name}: {WHY[why] or why}`, "compra")
end

local function Cancelled(s: Session, name: string)
	s.Cancelled = { Name = name, At = os.clock() }
	s.CancelledList[name] = (s.CancelledList[name] or 0) + 1
	Mark(s, `Canceló la compra de {name}`)
end

-- Money that came from somewhere known (the rest of what they made is the road's: riding and passes)
local function Income(s: Session, label: string, amount: number)
	if amount > 0 then
		s.Income[label] = (s.Income[label] or 0) + amount
	end
end

local function SetWindow(s: Session, name: string?)
	local now = os.clock()
	if s.Window then
		s.Windows[s.Window].Seconds += now - s.WindowAt
		Log(s, "ventana", `Cerró {WindowName(s.Window)} ({Time(now - s.WindowAt)} abierta)`)
	end
	s.Window = name
	s.WindowAt = now
	if name then
		local stats = s.Windows[name] or { Opens = 0, Seconds = 0 }
		s.Windows[name] = stats
		stats.Opens += 1
		if name == "Garage" then
			s.GarageSinceFoot = true
		end
		Mark(s, `Abrió {WindowName(name)}`)
	end
end

local bikeNames: { [string]: string } = {}
for _, vehicle in DealershipConfig.Vehicles do
	if vehicle.Model then
		bikeNames[vehicle.Model] = vehicle.Name
	end
end

-- The bike a seat is on, by the name players see
local function BikeName(seat: Instance): string
	local node: Instance? = seat
	while node and node ~= workspace do
		if node:IsA("Model") and bikeNames[node.Name] then
			return bikeNames[node.Name]
		end
		node = node.Parent
	end
	local model = seat:FindFirstAncestorOfClass("Model")
	return if model then model.Name else "?"
end

local function SpeedOf(seat: any): number?
	return if seat and seat.Parent then math.round(seat.AssemblyLinearVelocity.Magnitude * MPH_PER_STUD) else nil
end

local function OnSeat(s: Session, seat: Instance?, humanoid: Humanoid?)
	local riding = seat ~= nil and seat:IsA("VehicleSeat")
	if riding == (s.RideSince ~= nil) then
		return
	end
	local now = os.clock()
	if riding then
		s.RideSince = now
		s.MountedAt = now
		s.Mounts += 1
		s.FootSince = nil
		s.Seat = seat
		Mark(s, "Se subió a la moto " .. BikeName(seat :: Instance))
	else
		s.RideSeconds += now - s.RideSince
		s.RideSince = nil
		s.FootSince = now
		s.GarageSinceFoot = false
		-- why: thrown off, dead, the game taking them off (a teleport, BUY MORE, another SPAWN), the bike gone, else themselves
		local why
		if s.Character and s.Character:GetAttribute("Ragdolled") == true then
			why = "salió volando por un choque"
		elseif humanoid and humanoid.Health <= 0 then
			why = "murió"
		elseif s.ForcedAt and now - s.ForcedAt <= 1.5 then
			why = "lo bajó el juego: " .. (s.ForcedWhy or "?")
		elseif s.Seat and not s.Seat.Parent then
			why = "la moto desapareció"
		else
			why = "se bajó él"
		end
		local speed = SpeedOf(s.Seat)
		s.Seat = nil
		Mark(s, "Se bajó de la moto (" .. why .. (if speed then ", iba a " .. speed .. " mph" else "") .. ")")
	end
end

-- A status line in the full log as it changes (and every STATUS_EVERY seconds): where they are, how fast, the window,
-- how long since they touched anything
local function Status(s: Session, pulse: { [string]: any })
	local speed = if s.RideSince then SpeedOf(s.Seat) or 0 else nil
	local where = if pulse.Menu then "menú" elseif speed == nil then "pie" elseif speed < 3 then "parado" elseif speed < 40 then "lento" else "rápido"
	local idle = if pulse.Idle >= 120 then 3 elseif pulse.Idle >= 60 then 2 elseif pulse.Idle >= 15 then 1 else 0
	local key = `{where}|{s.Window or ""}|{idle}|{pulse.Focused}|{pulse.Cinematic}|{pulse.Watching}`
	local now = os.clock()
	if key == s.StatusKey and now - (s.StatusAt or 0) < STATUS_EVERY then
		return
	end
	s.StatusKey, s.StatusAt = key, now
	local parts = {}
	table.insert(parts, if pulse.Menu then "en el menú principal" elseif speed == nil then "a pie" elseif speed < 3 then "en moto, parado" else `en moto a {speed} mph`)
	if s.Window then
		table.insert(parts, `ventana {WindowName(s.Window)}`)
	end
	if pulse.Idle >= 5 then
		table.insert(parts, `sin tocar nada {Time(pulse.Idle)}`)
	end
	if not pulse.Focused then
		table.insert(parts, "juego minimizado")
	end
	if pulse.Cinematic then
		table.insert(parts, "en cinemática")
	end
	if pulse.Watching then
		table.insert(parts, "viendo repetición")
	end
	if pulse.Fps > 0 then
		table.insert(parts, `{pulse.Fps} FPS`)
	end
	Log(s, "estado", table.concat(parts, " · "))
end

local function OnCharacter(s: Session, character: Model)
	if s.CharacterJanitor then
		s.CharacterJanitor:Cleanup()
	end
	local janitor = Nexus.Janitor.new()
	s.CharacterJanitor = janitor
	s.Character = character
	janitor:Add(character:GetAttributeChangedSignal("Ragdolled"):Connect(function()
		if character:GetAttribute("Ragdolled") == true then
			s.Crashes += 1
			s.LastCrash = os.clock()
			table.insert(s.CrashTimes, s.LastCrash)
			if #s.CrashTimes > MAX_CRASH_TIMES then
				table.remove(s.CrashTimes, 1)
			end
			local speed = SpeedOf(s.Seat)
			Mark(s, if speed then `Chocó a {speed} mph` else "Chocó")
		end
	end), "Disconnect")
	local humanoid = character:WaitForChild("Humanoid", 10)
	if not (humanoid and humanoid:IsA("Humanoid")) or s.Character ~= character then
		return
	end
	janitor:Add(humanoid.Died:Connect(function()
		s.Deaths += 1
		Mark(s, "Murió")
	end), "Disconnect")
	janitor:Add(humanoid:GetPropertyChangedSignal("SeatPart"):Connect(function()
		OnSeat(s, humanoid.SeatPart, humanoid)
	end), "Disconnect")
	OnSeat(s, humanoid.SeatPart, humanoid)
end

-- What's in their data that the message needs (as it comes in, and last as they leave)
local function Capture(s: Session)
	local player = s.Player
	local vehicles = DataService:Get(player, "Garage.Vehicles")
	local bikes = 0
	for _, owned in if type(vehicles) == "table" then vehicles else {} do
		if owned then
			bikes += 1
		end
	end
	s.Final = {
		Cash = DataService:GetCash(player),
		XP = DataService:Get(player, "Progress.XP") or 0,
		PlayTime = DataService:Get(player, "Stats.PlayTime") or 0,
		Step = DataService:Get(player, "Tutorial.Step") or 0,
		Version = DataService:Get(player, "Tutorial.Version"),
		Shade = DataService:Get(player, "Tutorial.Shade"),
		Bikes = bikes,
	}
end

local function OnLoaded(s: Session, late: boolean)
	if s.Loaded then
		return
	end
	s.Loaded = true
	Capture(s)
	local final = s.Final
	-- (TutorialService starts a new player at step 1 a moment after this; `late`: this service came after that)
	local fresh = final.Step == 0 or (late and final.Step == 1 and final.PlayTime < 5)
	s.First = fresh and not DealershipConfig.OwnsAny(DataService:Get(s.Player, "Garage.Vehicles"))
	s.CashStart = final.Cash
	s.Cash = final.Cash
	s.XPStart = final.XP
	s.Step = final.Step
	s.StepAt = os.clock()
	s.Hearts = DataService:Get(s.Player, "Helmets.Durability") or 0
	s.StarterStep = DataService:Get(s.Player, "Quests.Starter.Step")
	local version = TutorialConfig.For(final.Version)
	local tutorial = if final.Step == 0 then "sin empezar" elseif final.Step >= version.Done then "terminado" else `{version.Id}, paso {StepName(final.Step, version)}`
	Log(s, "datos", `Cargaron sus datos: {Money(final.Cash)}, nivel {(ScoreConfig.LevelOf(final.XP))}, {final.Bikes} motos, tutorial {tutorial}` .. (if s.First then " (primera vez)" else ""))
end

local function OnStep(s: Session, step: number)
	if step == s.Step then
		return
	end
	local took = os.clock() - (s.StepAt or s.Started)
	s.Step = step
	s.StepAt = os.clock()
	Log(s, "tutorial", `(el paso anterior le tomó {Time(took)})`)
	local version = TutorialConfig.For(DataService:Get(s.Player, "Tutorial.Version"))
	if step >= version.Done then
		if not s.TutorialDone then
			s.TutorialDone = os.clock() - s.Started
			Mark(s, "Terminó el tutorial")
		end
	elseif step >= 1 then
		Mark(s, `Tutorial {StepName(step, version)}`)
	end
end

local function OnData(player: Player, path: string, value: any)
	local s = sessions[player]
	if not (s and s.Loaded) then
		return
	end
	if path == "Currency.Cash" and type(value) == "number" then
		local change = value - s.Cash
		s.Cash = value
		if s.Quiet then
			s.AdminCash += change -- (an admin's: neither made nor spent by them)
		elseif change > 0 then
			s.Earned += change
		else
			s.Spent -= change
		end
	elseif path == "Quests.Starter" and type(value) == "table" then
		-- a starter quest done: QuestService pays its reward right after
		local was = s.StarterStep
		if type(was) == "number" and type(value.Step) == "number" then
			for step = was, value.Step - 1 do
				local quest = QuestConfig.Starter[step]
				Income(s, "Quests", quest and quest.Cash or 0)
			end
		end
		s.StarterStep = value.Step
	elseif path == "Quests" and type(value) == "table" then
		s.StarterStep = if type(value.Starter) == "table" then value.Starter.Step else s.StarterStep
	elseif path == "Currency" and type(value) == "table" then
		s.Cash = value.Cash or s.Cash -- (an admin put it all back: not money made)
	elseif path == "Tutorial.Step" and type(value) == "number" then
		OnStep(s, value)
	elseif path == "Helmets.Durability" and type(value) == "number" then
		if value < s.Hearts then
			s.HeartsLost += s.Hearts - value
		end
		s.Hearts = value
	else
		if value == true and string.sub(path, 1, #VEHICLES_PATH) == VEHICLES_PATH then
			s.Received[string.sub(path, #VEHICLES_PATH + 1)] = true
		end
	end
end

--[[Friends]]
local function Met(s: Session, other: Player)
	if s.Friends[other.UserId] then
		return
	end
	local theirs = sessions[other]
	local already = theirs ~= nil and theirs.Started <= s.Started
	s.Friends[other.UserId] = { Name = other.DisplayName, Already = already, At = os.clock() - s.Started }
	if not already then
		Mark(s, `Entró su amigo {other.DisplayName}`)
	end
end

-- Their friends read once (a page is one call, a call for each pair in a full server would be dozens)
local function ReadFriends(s: Session)
	local ok, pages = pcall(function()
		return Players:GetFriendsAsync(s.Id)
	end)
	if not ok then
		return
	end
	local ids = {}
	for _ = 1, CONFIG.FriendPages do
		for _, friend in pages:GetCurrentPage() do
			ids[friend.Id] = true
		end
		if pages.IsFinished or not pcall(pages.AdvanceToNextPageAsync, pages) then
			break
		end
	end
	s.FriendIds = ids
	for _, other in Players:GetPlayers() do
		if other ~= s.Player and ids[other.UserId] then
			Met(s, other)
		end
	end
end

--[[Buying]]
-- `service[method]` still does what it did; `after(session, money it took, its first answer, its arguments...)` runs after
local function Watch(service: any, method: string, after: (Session, number, any, ...any) -> ())
	local original = service[method]
	if type(original) ~= "function" then
		warn(`[SessionReportService] nothing called {method} to watch`)
		return
	end
	service[method] = function(self: any, player: Player, ...: any): ...any
		local before = DataService:GetCash(player)
		local results = table.pack(original(self, player, ...))
		local s = sessions[player]
		if s then
			local ok, problem = pcall(after, s, before - DataService:GetCash(player), results[1], ...)
			if not ok then
				warn(`[SessionReportService] watching {method}:`, problem)
			end
		end
		return table.unpack(results, 1, results.n)
	end
end

-- A Developer Product's or Game Pass's name and price: the store's, else Roblox's
local function InfoOf(id: number, kind: Enum.InfoType): { [string]: any }
	local known = if kind == Enum.InfoType.GamePass then passes else products
	if known[id] then
		return known[id]
	end
	local ok, info = pcall(function()
		return MarketplaceService:GetProductInfo(id, kind)
	end)
	local entry = {
		Name = if ok and type(info) == "table" and info.Name then info.Name else `Producto {id}`,
		Robux = if ok and type(info) == "table" then info.PriceInRobux or 0 else 0,
	}
	known[id] = entry
	return entry
end

local function OnReceipt(receipt: { [string]: any })
	local player = Players:GetPlayerByUserId(receipt.PlayerId)
	local s = player and sessions[player]
	if not s or s.Receipts[receipt.PurchaseId] then
		return
	end
	s.Receipts[receipt.PurchaseId] = true
	local info = InfoOf(receipt.ProductId, Enum.InfoType.Product)
	local spent = if (receipt.CurrencySpent or 0) > 0 then receipt.CurrencySpent else info.Robux
	s.Robux += spent
	table.insert(s.RobuxBought, `**{info.Name}**: R$ {spent}`)
	Mark(s, `Compró con Robux: {info.Name}`)
end

local function WatchBuying()
	for _, item in ShopConfig.Items do
		if (item.ProductId or 0) ~= 0 then
			products[item.ProductId] = { Name = item.Name, Robux = item.Robux or 0, Cash = item.Cash }
		end
		if (item.GiftProductId or 0) ~= 0 then
			products[item.GiftProductId] = { Name = `Regalo: {item.Name}`, Robux = item.Robux or 0 }
		end
		if (item.GamePassId or 0) ~= 0 then
			passes[item.GamePassId] = { Name = item.Name, Robux = item.Robux or 0 }
		end
	end

	Watch(Nexus:GetService("DealershipService"), "Buy", function(s, paid, answer, id)
		local vehicle = DealershipConfig.Find(id)
		local name = if vehicle then vehicle.Name else id
		if answer == "Bought" then
			Bought(s, "Motos", name, paid, id)
		elseif answer == "Poor" then
			Tried(s, "Motos", name, "Poor", TutorialService:PriceFor(s.Player, id) or (vehicle and vehicle.Price))
		end
	end)
	Watch(TutorialService, "ChooseStarter", function(s, _, answer, id)
		if answer == "Chosen" then
			local vehicle = DealershipConfig.Find(id)
			Bought(s, "Motos", if vehicle then vehicle.Name else id, 0, id)
		end
	end)
	Watch(Nexus:GetService("HelmetService"), "Buy", function(s, paid, answer, id)
		local helmet = HelmetConfig.Find(id)
		local name = `Casco {if helmet then helmet.Name else id}`
		if answer == "Bought" then
			Bought(s, "Casco y lentes", name, paid)
		elseif WHY[answer] then
			Tried(s, "Casco y lentes", name, answer, helmet and helmet.Price)
		end
	end)
	Watch(Nexus:GetService("EquipmentService"), "Buy", function(s, paid, answer, section, id)
		local item = EquipmentConfig.Find(section, id)
		local name = `{if section == "Glasses" then "Lentes" elseif section == "Helmet" then "Casco" else section} {if item then item.Name else id}`
		if answer == "Bought" then
			Bought(s, "Casco y lentes", name, paid)
		elseif WHY[answer] then
			Tried(s, "Casco y lentes", name, answer, item and item.Price)
		end
	end)
	Watch(Nexus:GetService("TrickService"), "Buy", function(s, paid, answer, name)
		if answer == "Bought" then
			Bought(s, "Trucos", name, paid)
		elseif WHY[answer] then
			local trick = TrickConfig.Find(name)
			Tried(s, "Trucos", name, answer, trick and trick.Price)
		end
	end)
	Watch(Nexus:GetService("CustomizationService"), "BuyStage", function(s, paid, answer, partId, stage)
		local part = CustomizationConfig.Part(partId)
		local name = `{if part then part.Name else partId} STAGE {stage}`
		if answer == "Bought" then
			Bought(s, "Tuning", name, paid)
		elseif WHY[answer] then
			Tried(s, "Tuning", name, answer)
		end
	end)
	Watch(Nexus:GetService("ShopService"), "Buy", function(s, _, answer, id)
		if answer == "Prompted" then
			s.RobuxTries += 1
			local item = ShopConfig.Find(id)
			Mark(s, `Le dio a comprar {if item then item.Name else id} con Robux`)
		end
	end)
	Watch(Nexus:GetService("ShopService"), "Gift", function(s, _, answer, id)
		if answer == "Prompted" then
			s.RobuxTries += 1
			local item = ShopConfig.Find(id)
			Mark(s, `Quiso regalar {if item then item.Name else id}`)
		end
	end)
	-- (a cash pack offered as they came up short: Modules.CashOffer; not a press of theirs, so not in RobuxTries)
	Watch(Nexus:GetService("ShopService"), "Offer", function(s, _, answer, id)
		if answer == "Prompted" then
			local item = ShopConfig.Find(id)
			Mark(s, `Se le ofreció {if item then item.Name else id} (no le alcanzaba el dinero)`)
		end
	end)
	Watch(Nexus:GetService("BikeService"), "SpawnVehicle", function(s, _, answer, id)
		if answer == "Placed" then
			s.Spawns += 1
			local vehicle = DealershipConfig.Find(id)
			Mark(s, `Sacó la moto {if vehicle then vehicle.Name else id}`)
		end
	end)
	local pursuit = Nexus:GetService("PursuitService")
	Watch(pursuit, "Busted", function(s, _, summary)
		if summary then
			s.Busted += 1
			s.LastBusted = os.clock()
			Mark(s, "BUSTED")
		end
	end)
	Watch(pursuit, "Escape", function(s, paid, summary)
		if summary then
			s.Escaped += 1
			Income(s, "Policía", -paid)
			Mark(s, "Escapó de la policía")
		end
	end)

	-- what the game is doing for them when it takes them off the bike (OnSeat says so)
	local function During(service: any, method: string, label: (...any) -> string)
		local original = service[method]
		if type(original) ~= "function" then
			warn(`[SessionReportService] nothing called {method} to watch`)
			return
		end
		service[method] = function(self: any, player: Player, ...: any): ...any
			local s = sessions[player]
			local was = s and s.Doing
			if s then
				s.Doing = label(...)
			end
			local results = table.pack(pcall(original, self, player, ...))
			if s then
				s.Doing = was
			end
			if not results[1] then
				error(results[2], 0)
			end
			return table.unpack(results, 2, results.n)
		end
	end
	local teleports = Nexus:GetService("TeleportsService")
	During(teleports, "Go", function(id: any): string
		return `teleport a {id}`
	end)
	During(teleports, "Replay", function(): string
		return "REPLAY"
	end)
	During(Nexus:GetService("DealershipService"), "GoToDealer", function(): string
		return "BUY MORE"
	end)
	local bikes = Nexus:GetService("BikeService")
	During(bikes, "SpawnVehicle", function(id: any): string
		return `SPAWN de {id}`
	end)
	local getOff = bikes.GetOff
	if type(getOff) == "function" then
		bikes.GetOff = function(self: any, humanoid: Humanoid, ...: any): ...any
			local player = humanoid and Players:GetPlayerFromCharacter(humanoid.Parent)
			local s = player and sessions[player]
			if s then
				s.ForcedAt = os.clock()
				s.ForcedWhy = s.Doing or "el juego"
			end
			return getOff(self, humanoid, ...)
		end
	end
	Watch(teleports, "Go", function(s, _, arrived, id)
		if arrived then
			Mark(s, `Teleport a {id}`, "teleport")
		end
	end)
	Watch(pursuit, "Wanted", function(s, _, started)
		if started then
			Mark(s, "Un radar lo agarró: lo persigue la policía", "policía")
		end
	end)

	-- money from somewhere known: what the call itself paid them
	local function Paid(label: string)
		return function(s: Session, paid: number)
			Income(s, label, -paid)
		end
	end
	Watch(Nexus:GetService("DailyService"), "Claim", Paid("Daily login"))
	Watch(Nexus:GetService("QuestService"), "Claim", Paid("Quests"))
	local rewards = Nexus:GetService("RewardsService")
	Watch(rewards, "Redeem", Paid("Códigos"))
	Watch(rewards, "ClaimGroup", Paid("Grupo"))
	Watch(Nexus:GetService("EventService"), "Claim", Paid("Evento"))
	-- an admin's cash for someone: neither made nor spent by them (the admin's the caller, they're `userId`)
	local admin = Nexus:GetService("AdminService")
	local setCash = admin.Cash
	if type(setCash) == "function" then
		admin.Cash = function(self: any, player: Player, userId: number, ...: any): ...any
			local target = Players:GetPlayerByUserId(userId)
			local s = target and sessions[target]
			if s then
				s.Quiet = true
			end
			local results = table.pack(pcall(setCash, self, player, userId, ...))
			if s then
				s.Quiet = nil
			end
			if not results[1] then
				error(results[2], 0)
			end
			return table.unpack(results, 2, results.n)
		end
	end

	local process = DataService.ProcessReceipt
	DataService.ProcessReceipt = function(self: any, receipt: { [string]: any }, grant: (Player) -> boolean)
		-- (what giving it paid them, measured round the grant alone: the wait for its save isn't counted)
		local function counted(player: Player): boolean
			local before = DataService:GetCash(player)
			local granted = grant(player)
			local s = sessions[player]
			if s then
				Income(s, "Robux", DataService:GetCash(player) - before)
			end
			return granted
		end
		local decision = process(self, receipt, counted)
		if decision == Enum.ProductPurchaseDecision.PurchaseGranted then
			task.spawn(OnReceipt, receipt) -- (its name may take a moment to look up: Roblox gets its answer now)
		end
		return decision
	end
end

--[[Why they left]]
local function TutorialState(s: Session): (any, boolean)
	local final = s.Final
	local version = TutorialConfig.For(final and final.Version)
	return version, final ~= nil and final.Step >= 1 and final.Step < version.Done
end

-- Every reason that fits, the likeliest first: { Weight, Text }
local function Reasons(s: Session, played: number): { { [string]: any } }
	local found = {}
	local function add(weight: number, text: string)
		table.insert(found, { Weight = weight, Text = text })
	end
	local now = s.Ended
	local function recent(at: number?, within: number): boolean
		return at ~= nil and now - at <= within
	end
	local pulse = s.Pulse
	local final = s.Final
	local menu = pulse ~= nil and pulse.Menu

	if closing then
		add(100, "El servidor se cerró (actualización o shutdown)")
	end
	if pulse and pulse.Teleporting then
		add(99, "No se fue del juego: cambió de servidor")
	end
	if not s.Loaded or not pulse then
		add(98, `Se salió cargando, nunca llegó a ver el juego ({Time(played)})`)
	end
	if pulse then
		if pulse.Idle >= LIMITS.RobloxKick then
			add(90, `Roblox lo sacó por AFK (llevaba {Time(pulse.Idle)} sin tocar nada)`)
		elseif pulse.Idle >= LIMITS.AfkLeave then
			add(88, `AFK: llevaba {Time(pulse.Idle)} sin tocar nada`)
		end
		if pulse.Menu then
			add(80, `Se salió en el menú principal sin darle a PLAY ({Time(played)})`)
		end
		if pulse.Cinematic then
			add(78, "Se salió en medio de una animación o cinemática")
		end
		if pulse.Watching then
			add(60, "Se salió viendo una repetición")
		end
		if pulse.RaceGarage then
			add(60, "Se salió en la pantalla final de la carrera")
		end
		if not pulse.Focused and pulse.Idle >= 15 then
			add(46, "Tenía el juego minimizado")
		end
	end
	if s.Cancelled and recent(s.Cancelled.At, LIMITS.AfterCancel) then
		add(82, `Canceló la compra de {s.Cancelled.Name} y se fue`)
	end
	if s.RagdolledAtEnd or recent(s.LastCrash, LIMITS.AfterCrash) then
		add(76, "Se salió justo después de chocar")
	end
	if recent(s.LastBusted, LIMITS.AfterBusted) then
		add(75, "Se salió justo después de que lo arrestaran (BUSTED)")
	end
	if s.RideSince and recent(s.MountedAt, LIMITS.Mounting) then
		add(72, "Se salió subiéndose a la moto")
	end

	local version, inTutorial = TutorialState(s)
	if inTutorial then
		local onStep = now - (s.StepAt or s.Started)
		if onStep >= LIMITS.TutorialStuck then
			add(70, `Atorado en el tutorial: {Time(onStep)} en el paso {StepName(final.Step, version)}`)
		end
	end

	if s.Window then
		local open = now - s.WindowAt
		local label = WindowName(s.Window)
		local clicks = if pulse then pulse.Clicks else 0
		if open >= LIMITS.WindowStuck and clicks >= LIMITS.StuckClicks then
			add(69, `Se quedó pillado en la UI: {label} abierta {Time(open)} y {clicks} clics sin salir de ahí`)
		elseif open >= LIMITS.WindowStuck then
			add(55, `Se quedó mirando {label} {Time(open)} y se fue`)
		else
			add(53, `Se salió con {label} abierta`)
		end
	end

	local bikes = if final then final.Bikes else 0
	local onFoot = s.FootSince and now - s.FootSince
	if onFoot and not menu and bikes > 0 and onFoot >= LIMITS.OnFoot and not s.GarageSinceFoot then
		add(66, `Se bajó de la moto y no sacó otra: {Time(onFoot)} a pie sin abrir el Garage`)
	elseif s.Loaded and s.Mounts == 0 and bikes > 0 and played >= LIMITS.OnFoot and not menu then
		add(63, "Tenía moto pero no se subió a ninguna")
	end
	if s.Loaded and bikes == 0 and played >= LIMITS.NoBike and not menu then
		add(64, `Nunca consiguió una moto en {Time(played)}`)
	end

	for _, friend in s.Friends do
		if friend.Left and now - friend.Left <= LIMITS.AfterFriend then
			add(62, `Su amigo {Clean(friend.Name)} se fue {Time(now - friend.Left)} antes`)
		end
	end
	if s.LastPoor and recent(s.LastPoor.At, LIMITS.AfterPoor) then
		add(61, `Quiso comprar {s.LastPoor.Name} y no le alcanzó`)
	end
	local crashes = 0
	for _, at in s.CrashTimes do
		if now - at <= LIMITS.CrashWindow then
			crashes += 1
		end
	end
	if crashes >= LIMITS.ManyCrashes then
		add(59, `Se estrelló {crashes} veces en los últimos {Time(LIMITS.CrashWindow)}`)
	end
	if s.Deaths >= LIMITS.ManyDeaths then
		add(58, `Murió {s.Deaths} veces`)
	end
	if s.Mode and s.Mode ~= "JustDrive" then
		add(56, if s.Mode == "Race" then "Se salió en plena carrera" else "Se salió en plena persecución")
	end
	if s.FpsCount >= 3 and s.FpsSum / s.FpsCount < LIMITS.LowFps then
		add(50, `Le iba lento: {math.round(s.FpsSum / s.FpsCount)} FPS de media`)
	end
	if s.Ping and s.Ping >= LIMITS.HighPing then
		add(49, `Mucho lag: {math.round(s.Ping)} ms`)
	end
	if played < LIMITS.Short then
		add(45, `Se fue a los {Time(played)}, casi ni lo probó`)
	end
	if s.PlayersLeft == 0 and played >= LIMITS.Short then
		add(30, "Estaba solo en el servidor")
	end
	if played >= LIMITS.Long then
		add(20, `Sesión larga ({Time(played)}): parece que ya había terminado de jugar`)
	end
	add(10, if s.RideSince then "Se salió mientras iba en la moto, sin señales raras" else "Se salió sin señales claras")

	table.sort(found, function(a, b)
		return a.Weight > b.Weight
	end)
	return found
end

--[[The message]]
local function Bullets(lines: { string }): string
	local out = {}
	for _, line in lines do
		table.insert(out, "• " .. line)
	end
	return table.concat(out, "\n")
end

local function BoughtLines(s: Session): { string }
	local lines = {}
	for _, item in s.Bought do
		table.insert(lines, `**{item.Name}**: ` .. (if item.Price > 0 then Money(item.Price) else "gratis"))
	end
	for id in s.Received do
		if not s.BoughtIds[id] then
			local vehicle = DealershipConfig.Find(id)
			table.insert(lines, `**{if vehicle then vehicle.Name else id}**: recibida (daily, pack o regalo)`)
		end
	end
	return lines
end

local function TriedLines(s: Session): { string }
	local lines = {}
	for _, entry in s.TriedList do
		local why = WHY[entry.Why] or entry.Why
		if (entry.Why == "Poor" or entry.Why == "Cash") and entry.Price then
			why = `le faltaban {Money(math.max(entry.Price - (entry.Cash or 0), 0))}`
		end
		table.insert(lines, `**{entry.Name}**: {why}` .. (if entry.Count > 1 then ` (x{entry.Count})` else ""))
	end
	table.sort(lines)
	return lines
end

local function RobuxLines(s: Session): { string }
	local lines = table.clone(s.RobuxBought)
	local cancelled = {}
	for name, count in s.CancelledList do
		table.insert(cancelled, `Canceló **{name}**` .. (if count > 1 then ` (x{count})` else ""))
	end
	table.sort(cancelled)
	table.move(cancelled, 1, #cancelled, #lines + 1, lines)
	return lines
end

-- What happened riding, only what did
local function RoadText(s: Session): string
	local parts = {}
	local function count(amount: number, one: string, many: string)
		if amount > 0 then
			table.insert(parts, `{amount} {if amount == 1 then one else many}`)
		end
	end
	if s.RideSeconds >= 1 then
		table.insert(parts, `{Time(s.RideSeconds)} en moto`)
	end
	count(s.Crashes, "choque", "choques")
	count(s.Deaths, "muerte", "muertes")
	count(s.HeartsLost, "corazón perdido", "corazones perdidos")
	count(s.Busted, "BUSTED", "BUSTED")
	count(s.Escaped, "escape", "escapes")
	if s.BestCombo > 0 then
		table.insert(parts, `racha x{s.BestCombo}`)
	end
	if s.Points > 0 then
		table.insert(parts, `{string.sub(Money(s.Points), 2)} pts`)
	end
	if #parts == 0 then
		return if s.Loaded and s.Mounts == 0 then "No se subió a la moto" else ""
	end
	return table.concat(parts, " · ")
end

local function WindowsText(s: Session): string
	local others = {}
	for name, stats in s.Windows do
		if name ~= "Shop" then
			table.insert(others, { Name = name, Opens = stats.Opens, Seconds = stats.Seconds })
		end
	end
	table.sort(others, function(a, b)
		return a.Seconds > b.Seconds
	end)
	local words = {}
	for index = 1, math.min(#others, 5) do
		local stats = others[index]
		table.insert(words, `{WindowName(stats.Name)} ({Time(stats.Seconds)})`)
	end
	return table.concat(words, " · ")
end

local function FriendsText(s: Session): string
	local lines = {}
	if s.Followed then
		table.insert(lines, `Entró siguiendo a **{Clean(s.Followed)}**`)
	end
	for _, friend in s.Friends do
		local line = `**{Clean(friend.Name)}** ` .. (if friend.Already then "ya estaba" else `llegó a los {Time(friend.At)}`)
		if friend.Left then
			line ..= `, se fue a los {Time(friend.Left - s.Started)}`
		end
		table.insert(lines, line)
	end
	if #lines == 0 then
		return if s.FriendIds then "Ninguno" else "No se pudo leer"
	end
	return table.concat(lines, "\n")
end


local function Precise(seconds: number): string
	local tenths = math.max(0, math.floor(seconds * 10))
	return string.format("%d:%02d.%d", tenths // 600, (tenths // 10) % 60, tenths % 10)
end

-- The full log's lines in order, each "min:sec.tenth [kind] what"
local function LogLines(s: Session): { string }
	local log = table.clone(s.Log)
	table.sort(log, function(a, b)
		if a.At ~= b.At then
			return a.At < b.At
		end
		return a.Seq < b.Seq
	end)
	local lines = {}
	for _, entry in log do
		local text = string.gsub(entry.Text, "`", "'")
		table.insert(lines, `{Precise(entry.At)} [{entry.Kind}] {text}` .. (if entry.Count > 1 then ` (x{entry.Count})` else ""))
	end
	return lines
end

-- As many of the log's last lines as fit in `room` characters, in a code block (how many older ones didn't, on top)
local function LogBlock(s: Session, room: number): string
	local lines = LogLines(s)
	local kept, used = {}, 80 -- (the fences and the line on top)
	for index = #lines, 1, -1 do
		local size = (utf8.len(lines[index]) or #lines[index]) + 1
		if used + size > room then
			break
		end
		table.insert(kept, 1, lines[index])
		used += size
	end
	local hidden = #lines - #kept + s.LogDropped
	return (if hidden > 0 then `*{hidden} líneas más viejas no caben aquí*\n` else "") .. "```\n" .. table.concat(kept, "\n") .. "\n```"
end

local function TutorialCell(s: Session): (string, string)
	local final = s.Final
	local version, inTutorial = TutorialState(s)
	if not final or final.Step == 0 then
		return "🎓 Tutorial", "No empezó"
	end
	local name = `🎓 Tutorial {version.Id}` .. (if final.Shade == false then " (sin oscuro)" else "")
	if not inTutorial then
		return name, "✅ **Completado**" .. (if s.TutorialDone then `\nen {Time(s.TutorialDone)}` else "")
	end
	local info = version.Steps[final.Step]
	local key = info and (info.Name or info.Id)
	local words = key and CONFIG.Steps[key] or key or "?"
	return name, `❌ **Drop paso {final.Step}/{version.Done - 1}**\n{words}\n{Time(s.Ended - (s.StepAt or s.Started))} ahí`
end

local function Report(s: Session): { [string]: any }
	local played = s.Ended - s.Started
	local final = s.Final
	local found = Reasons(s, played)
	local also = {}
	for index = 2, math.min(#found, 3) do
		if found[index].Weight >= 45 then
			table.insert(also, found[index].Text)
		end
	end

	local fields = {}
	local budget = 3300 -- (Discord: 6,000 characters a message, all its embeds: the rest is for the log under it)
	local function Add(name: string, value: string, inline: boolean?)
		if value == "" or budget < 60 then
			return
		end
		local text = Cap(value, math.min(CONFIG.FieldMax, budget))
		budget -= (utf8.len(text) or #text) + #name
		table.insert(fields, { name = name, value = text, inline = inline == true })
	end

	-- three rows of three (Discord lays inline fields three across): what to read at a glance
	local pulse = s.Pulse
	local afk = if pulse then pulse.Afk else 0
	Add("⏱️ Jugó", `**{Time(played)}**` .. (if afk >= 1 then `\n{Time(afk)} AFK` else ""), true)
	if s.First then
		local name, value = TutorialCell(s)
		Add(name, value, true)
	elseif s.Loaded then
		local xp = final.XP - (s.XPStart or final.XP)
		local level = `**Nivel {ScoreConfig.LevelOf(final.XP)}**` .. (if xp > 0 then ` (+{string.sub(Money(xp), 2)} XP)` else "")
		local lines = { level, `{final.Bikes} motos · {Time(final.PlayTime)} jugadas` }
		local version, inTutorial = TutorialState(s)
		if inTutorial then
			table.insert(lines, `Sin terminar tutorial: {StepName(final.Step, version)}`)
		end
		Add("📈 Progreso", table.concat(lines, "\n"), true)
	else
		Add("📦 Datos", "No cargaron", true)
	end
	Add("👥 Amigos", FriendsText(s), true)

	if s.Loaded then
		-- where it came from: each known source, the rest the road's (riding, passes)
		local sources, known = {}, 0
		for label, amount in s.Income do
			table.insert(sources, { Label = label, Amount = amount })
			known += amount
		end
		if s.Earned - known >= 1 then
			table.insert(sources, { Label = "Carretera", Amount = s.Earned - known })
		end
		table.sort(sources, function(a, b)
			return a.Amount > b.Amount
		end)
		local made = { `**{Money(s.Earned)}**` }
		if s.Earned > 0 then
			for index = 1, math.min(#sources, 3) do
				table.insert(made, `{sources[index].Label} {Money(sources[index].Amount)}`)
			end
		end
		Add("💵 Ganó", table.concat(made, "\n"), true)
		Add("💸 Gastó", `**{Money(s.Spent)}**`, true)
		local wallet = `Entró con {Money(s.CashStart or 0)}\nSe fue con {Money(final.Cash)}`
		if s.AdminCash ~= 0 then
			wallet ..= `\nAdmin: {if s.AdminCash > 0 then "+" else "-"}{Money(s.AdminCash)}`
		end
		Add("🏦 Dinero", wallet, true)
	end

	local shop = s.Windows.Shop
	Add("🛒 Tienda", if shop then `**Sí**, {Times(shop.Opens)}\n{Time(shop.Seconds)} dentro` else "No la abrió", true)
	Add("💎 Robux", if s.Robux > 0 then `**R$ {s.Robux}**` elseif s.RobuxTries > 0 then `R$ 0\nLe dio a comprar {Times(s.RobuxTries)}` else "R$ 0", true)
	local device = if pulse then DEVICES[pulse.Device] else "?"
	local fps = if s.FpsCount > 0 then math.round(s.FpsSum / s.FpsCount) else nil
	Add("📱 Equipo", device .. (if fps then `\n{fps} FPS` else "") .. (if s.Ping then `\n{math.round(s.Ping)} ms` else ""), true)

	-- then the lists, only those with something in them
	local bought, tried = BoughtLines(s), TriedLines(s)
	if #bought > 0 then
		Add("✅ Compró", Bullets(bought))
	end
	if #tried > 0 then
		Add("🔒 Quiso comprar y no pudo", Bullets(tried))
	end
	if s.Loaded and #bought == 0 and #tried == 0 then
		Add("🛍️ Compras", "No compró ni intentó comprar nada")
	end
	local robux = RobuxLines(s)
	if #robux > 0 then
		Add("💎 Detalle de Robux", Bullets(robux))
	end
	Add("🏍️ En la carretera", RoadText(s))
	Add("🪟 Pantallas que abrió", WindowsText(s))

	local heading, color
	if s.First then
		heading, color = "🆕 PRIMERA VEZ", CONFIG.Colors.First
	elseif s.Loaded then
		heading, color = "🔁 VOLVIÓ", CONFIG.Colors.Returning
	else
		heading, color = "⏳ NO CARGÓ", CONFIG.Colors.NotLoaded
	end
	local server = if game.PrivateServerId ~= "" then "server privado" else "server público"
	local where = if RunService:IsStudio() then "STUDIO · " else ""
	local main = {
		-- the name on top, small; the reason is what's read first, the title
		author = { name = `{heading} · {s.Display} (@{s.Name})`, url = `https://www.roblox.com/users/{s.Id}/profile` },
		title = Cap(found[1].Text, 240),
		color = color,
		description = if #also > 0 then Cap(`*También: {table.concat(also, " · ")}*`, 500) else nil,
		fields = fields,
		url = Analytics.Link(s), -- (the title opens the session in the analytics dashboard)
		footer = { text = `{where}{server} · quedaban {s.PlayersLeft} jugadores · v{game.PlaceVersion}` },
		timestamp = DateTime.now():ToIsoDate(),
	}
	local used = (utf8.len(main.author.name) or 0) + (utf8.len(main.title) or 0) + (utf8.len(main.footer.text) or 0)
		+ (if main.description then utf8.len(main.description) or 0 else 0)
	for _, field in fields do
		used += (utf8.len(field.name) or 0) + (utf8.len(field.value) or 0)
	end
	local logTitle = "📜 Todo lo que hizo (lo más nuevo al final)"
	local room = math.min(4000, 5900 - used - (utf8.len(logTitle) or 0))
	local embeds = { main }
	if room >= 300 then
		table.insert(embeds, { title = logTitle, color = color, description = LogBlock(s, room) })
	end
	return { username = CONFIG.Username, allowed_mentions = { parse = {} }, embeds = embeds }
end

--[[The analytics backend's summary: everything above as data, not words]]
-- Where they are in the tutorial now: (in it, version id, step, step's words)
local function TutorialNow(s: Session): (boolean, string?, number?, string?)
	if not (s.Loaded and s.Final) then
		return false
	end
	local version = TutorialConfig.For(s.Final.Version)
	local step = s.Step or 0
	if step < 1 or step >= version.Done then
		return false
	end
	return true, version.Id, step, StepName(step, version)
end

local function Summary(s: Session): { [string]: any }
	local played = s.Ended - s.Started
	local final = s.Final
	local pulse = s.Pulse
	local reasons = {}
	for index, reason in Reasons(s, played) do
		if index > 6 then
			break
		end
		table.insert(reasons, { w = reason.Weight, t = reason.Text })
	end
	local summary: { [string]: any } = {
		played = math.round(played),
		afk = if pulse then pulse.Afk else 0,
		first = if s.Loaded then s.First == true else nil,
		loaded = s.Loaded,
		device = if pulse then pulse.Device else nil,
		fps = if s.FpsCount > 0 then math.round(s.FpsSum / s.FpsCount) else nil,
		ping = if s.Ping then math.round(s.Ping) else nil,
		mode = s.Mode,
		playersLeft = s.PlayersLeft,
		closing = closing,
		reasons = reasons,
		mounts = s.Mounts,
		spawns = s.Spawns,
		crashes = s.Crashes,
		deaths = s.Deaths,
		heartsLost = s.HeartsLost,
		busted = s.Busted,
		escaped = s.Escaped,
		bestCombo = s.BestCombo,
		points = s.Points,
		rideSeconds = math.round(s.RideSeconds),
		robux = s.Robux,
		robuxTries = s.RobuxTries,
		followed = s.Followed,
	}
	local robux = {}
	for _, line in RobuxLines(s) do
		table.insert(robux, (string.gsub(line, "%*", "")))
	end
	summary.robuxBought = robux
	if s.Loaded and final then
		local income, known = {}, 0
		for label, amount in s.Income do
			income[label] = amount
			known += amount
		end
		if s.Earned - known >= 1 then
			income.Carretera = s.Earned - known
		end
		summary.income = income
		summary.cashStart = s.CashStart
		summary.cashEnd = final.Cash
		summary.earned = s.Earned
		summary.spent = s.Spent
		summary.adminCash = if s.AdminCash ~= 0 then s.AdminCash else nil
		summary.level = (ScoreConfig.LevelOf(final.XP))
		summary.xpGain = final.XP - (s.XPStart or final.XP)
		summary.bikes = final.Bikes
		summary.playTime = final.PlayTime
		local version = TutorialConfig.For(final.Version)
		local step = final.Step
		local info = version.Steps[step]
		local key = info and (info.Name or info.Id)
		summary.tutorial = {
			version = version.Id,
			step = step,
			total = version.Done - 1,
			done = step >= version.Done,
			name = if key then CONFIG.Steps[key] or key else nil,
			shade = final.Shade,
			doneAt = if s.TutorialDone then math.round(s.TutorialDone) else nil,
			inStep = if step >= 1 and step < version.Done then math.round(s.Ended - (s.StepAt or s.Started)) else nil,
		}
	end
	local bought = {}
	for _, item in s.Bought do
		table.insert(bought, { g = item.Group, n = item.Name, p = item.Price })
	end
	for id in s.Received do
		if not s.BoughtIds[id] then
			local vehicle = DealershipConfig.Find(id)
			table.insert(bought, { g = "Recibida (daily, pack o regalo)", n = if vehicle then vehicle.Name else id, p = 0 })
		end
	end
	summary.bought = bought
	local tried = {}
	for _, entry in s.TriedList do
		table.insert(tried, { g = entry.Group, n = entry.Name, why = WHY[entry.Why] or entry.Why, p = entry.Price, c = entry.Count, cash = entry.Cash })
	end
	summary.tried = tried
	local windows = {}
	for name, stats in s.Windows do
		windows[name] = { name = WindowName(name), opens = stats.Opens, seconds = math.round(stats.Seconds) }
	end
	summary.windows = windows
	local friends = {}
	for _, friend in s.Friends do
		table.insert(friends, friend.Name)
	end
	summary.friends = friends
	return summary
end

-- Why they left as a signal, when it's something that went wrong (the reasons' weights: the rules above)
local LEAVE_SIGNALS = {
	[98] = true, [82] = true, [80] = true, [78] = true, [76] = true, [75] = true, [72] = true, [70] = true, [69] = true,
	[66] = true, [64] = true, [63] = true, [61] = true, [59] = true, [58] = true, [55] = true, [53] = true, [50] = true,
	[49] = true, [45] = true,
}

--[[Sending, and stopping everywhere when it's saturated]]
local serverId = if game.JobId ~= "" then game.JobId else HttpService:GenerateGUID(false)
local pauseMap: any = nil
local pausedUntil = 0 -- this server's copy of when the pause is over (0: none)
local localPause = { Since = 0, Why = "", Dropped = 0 } -- (for when the MemoryStore can't be reached)
local watching = false
local queue: { { [string]: any } } = {}
local working = false

local function Now(): number
	return DateTime.now().UnixTimestamp
end

local function RetryAfter(response: { [string]: any }): number?
	local header = response.Headers and (response.Headers["retry-after"] or response.Headers["Retry-After"])
	local seconds = tonumber(header)
	if seconds then
		return seconds
	end
	local ok, body = pcall(HttpService.JSONDecode, HttpService, response.Body)
	return if ok and type(body) == "table" then tonumber(body.retry_after) else nil
end

-- One message: "Ok", "Slow" (through, but it took too long), "Saturated" or "Bad" (refused for what it says: a mistake
-- here, no reason to stop anything); then why, and the seconds it asked to be left alone
local function Send(payload: { [string]: any }): (string, string?, number?)
	local test = if RunService:IsStudio() then workspace:GetAttribute(CONFIG.TestStatus) else nil
	if type(test) == "number" then
		warn(`[SessionReportService] Studio: answering as if the webhook had said {test}`)
		return if test >= 200 and test < 300 then "Ok" else "Saturated", `HTTP {test}`, nil
	end
	local ok, body = pcall(HttpService.JSONEncode, HttpService, payload)
	if not ok then
		warn("[SessionReportService] couldn't encode a message:", body)
		return "Bad", "encode", nil
	end
	local why = "sin respuesta"
	for try = 1, CONFIG.Tries do
		local started = os.clock()
		local answered, response = pcall(function()
			return HttpService:RequestAsync({
				Url = CONFIG.Webhook,
				Method = "POST",
				Headers = { ["Content-Type"] = "application/json" },
				Body = body,
			})
		end)
		local took = os.clock() - started
		if answered then
			local status = response.StatusCode
			if RunService:IsStudio() then
				print(`[SessionReportService] Studio: webhook answered {status} in {math.round(took * 100) / 100}s`)
			end
			if response.Success then
				if took >= CONFIG.Slow then
					return "Slow", `tardó {math.round(took)}s en responder`, nil
				end
				return "Ok", nil, nil
			end
			if status == 429 or status == 401 or status == 403 or status == 404 then
				return "Saturated", `HTTP {status}`, RetryAfter(response)
			end
			if status < 500 then
				warn(`[SessionReportService] the webhook refused a message: {status}`, string.sub(response.Body, 1, 300))
				return "Bad", `HTTP {status}`, nil
			end
			why = `HTTP {status}`
		else
			warn("[SessionReportService] no answer from the webhook:", response)
			why = "sin respuesta"
		end
		if try < CONFIG.Tries then
			task.wait(CONFIG.RetryWait)
		end
	end
	return "Saturated", why, nil
end

local function PauseLength(strikes: number, retryAfter: number?): number
	local length = math.min(PAUSE.Base * 2 ^ (strikes - 1), PAUSE.Max)
	local test = if RunService:IsStudio() then workspace:GetAttribute(CONFIG.TestPause) else nil
	if type(test) == "number" then
		length = test
	end
	return math.max(length, retryAfter or 0)
end

local function ReadState(): (boolean, any)
	if not pauseMap then
		return false, nil
	end
	return pcall(function()
		return pauseMap:GetAsync(STORE_KEY)
	end)
end

local function Publish(message: { [string]: any })
	local ok, problem = pcall(function()
		MessagingService:PublishAsync(TOPIC, message)
	end)
	if not ok and RunService:IsStudio() then
		warn("[SessionReportService] publish:", problem)
	end
end

-- The notice of a pause that's over
local function Notice(state: { [string]: any }): { [string]: any }
	local since = state.Since or Now()
	local dropped = state.Dropped or 0
	return {
		username = CONFIG.Username,
		allowed_mentions = { parse = {} },
		embeds = {
			{
				title = "⏸️ Los reportes se pausaron por saturación",
				color = CONFIG.Colors.Pause,
				description = `El webhook se saturó o dejó de responder, así que **todos los servers** dejaron de mandar.\n\n`
					.. `**Motivo:** {state.Why or "?"}\n**Tiempo en pausa:** {Time(Now() - since)}\n`
					.. `**Reportes que no se mandaron:** {dropped}\n\nYa funciona otra vez: los reportes siguen desde ahora.`,
				timestamp = DateTime.now():ToIsoDate(),
			},
		},
	}
end

-- Whether this server gets to try now the pause is over (one at a time; no MemoryStore: each its own)
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
		return true -- (the MemoryStore's down: this server's own pause is all there is)
	end
	return type(state) == "table" and state.Try == serverId
end

local Trip -- (below: a try that fails trips it again)

-- A look at the pause: over everywhere, or its time's up and this server gets to try (the notice is the try)
local function Look()
	local known, state = ReadState()
	if known and state == nil then
		pausedUntil = 0
		return
	end
	if known then
		pausedUntil = state.Until
	end
	if Now() < pausedUntil or not ClaimTry() then
		return
	end
	local result, why, retryAfter = Send(Notice(if known then state else localPause))
	if result == "Saturated" then
		Trip(why or "sin respuesta", retryAfter)
		return
	end
	if pauseMap then
		pcall(function()
			pauseMap:RemoveAsync(STORE_KEY)
		end)
	end
	pausedUntil = 0
	localPause.Dropped = 0
	Publish({ Clear = true })
	print("[SessionReportService] the webhook works again: reports back on")
end

-- This server paused till `untilTime`, looking at the state now and then till it's over
local function Hold(untilTime: number)
	pausedUntil = math.max(pausedUntil, untilTime)
	if watching then
		return
	end
	watching = true
	task.spawn(function()
		while pausedUntil > 0 do
			local testing = RunService:IsStudio() and workspace:GetAttribute(CONFIG.TestPause) ~= nil
			task.wait(math.min(PAUSE.Check, math.max(pausedUntil - Now(), 2)) + (if testing then 0 else math.random() * PAUSE.Jitter))
			local ok, problem = pcall(Look)
			if not ok then
				warn("[SessionReportService] looking at the pause:", problem)
			end
		end
		watching = false
	end)
end

-- Saturated: every server stops. The first server to say so sets how long; others finding it set leave it alone
Trip = function(why: string, retryAfter: number?)
	local now = Now()
	local untilTime = now + PauseLength(1, retryAfter)
	localPause.Since = if localPause.Since > 0 and pausedUntil > 0 then localPause.Since else now
	localPause.Why = why
	if pauseMap then
		local ok, state = pcall(function()
			return pauseMap:UpdateAsync(STORE_KEY, function(old: any)
				if type(old) == "table" and old.Until > now then
					return nil
				end
				local strikes = (if type(old) == "table" then old.Strikes or 0 else 0) + 1
				return {
					Since = if type(old) == "table" then old.Since else now,
					Until = now + PauseLength(strikes, retryAfter),
					Why = why,
					Strikes = strikes,
					Dropped = if type(old) == "table" then old.Dropped or 0 else 0,
				}
			end, PAUSE.Expiry)
		end)
		if ok and type(state) == "table" then
			untilTime = state.Until
		elseif not ok then
			warn("[SessionReportService] couldn't write the pause:", state)
		end
	end
	warn(`[SessionReportService] saturated ({why}): every server stops for {untilTime - now}s`)
	Hold(untilTime)
	Publish({ Until = untilTime })
end

-- Reports let go during a pause: counted for its notice
local function Drop(count: number)
	localPause.Dropped += count
	if pauseMap then
		pcall(function()
			pauseMap:UpdateAsync(STORE_KEY, function(old: any)
				if type(old) ~= "table" then
					return nil
				end
				old.Dropped = (old.Dropped or 0) + count
				return old
			end, PAUSE.Expiry)
		end)
	end
end

-- Whether reports may go out right now
local function Open(): boolean
	local known, state = ReadState()
	if known then
		if state == nil then
			pausedUntil = 0
			return true
		end
		Hold(state.Until)
		return false
	end
	return pausedUntil == 0
end

local function Work()
	while #queue > 0 do
		if not Open() then
			Drop(#queue)
			table.clear(queue)
			break
		end
		local payload = table.remove(queue, 1) :: { [string]: any }
		local result, why, retryAfter = Send(payload)
		if result == "Saturated" then
			Trip(why or "sin respuesta", retryAfter)
			Drop(1 + #queue)
			table.clear(queue)
			break
		elseif result == "Slow" then
			Trip(why or "lento", retryAfter)
			Drop(#queue)
			table.clear(queue)
			break
		end
		if #queue > 0 then
			task.wait(if closing then CONFIG.ClosingSpacing else CONFIG.Spacing)
		end
	end
	working = false
end

local function Enqueue(payload: { [string]: any })
	table.insert(queue, payload)
	while #queue > CONFIG.QueueMax do
		table.remove(queue, 1)
	end
	if not working then
		working = true
		task.spawn(function()
			local ok, problem = pcall(Work)
			if not ok then
				working = false
				warn("[SessionReportService] sending:", problem)
			end
		end)
	end
end

--[[Joining and leaving]]
local function Join(player: Player)
	if sessions[player] then
		return
	end
	local s = New(player)
	sessions[player] = s
	Analytics.Begin(s)
	Log(s, "servidor", `Entró al servidor ({#Players:GetPlayers()} jugadores)`)
	if player.FollowUserId ~= 0 then
		local followed = Players:GetPlayerByUserId(player.FollowUserId)
		s.Followed = if followed then followed.DisplayName else `el usuario {player.FollowUserId}`
	end
	for other, theirs in sessions do
		if other ~= player and theirs.FriendIds and theirs.FriendIds[player.UserId] then
			Met(theirs, player)
		end
	end
	task.spawn(ReadFriends, s)
	Nexus:PlayerJanitor(player):Add(player.CharacterAdded:Connect(function(character: Model)
		OnCharacter(s, character)
	end), "Disconnect")
	if player.Character then
		task.spawn(OnCharacter, s, player.Character)
	end
	if DataService:IsLoaded(player) then
		OnLoaded(s, true)
	end
end

local function Finish(player: Player, s: Session, discord: boolean)
	if s.CharacterJanitor then
		s.CharacterJanitor:Destroy()
	end
	if s.RideSince then
		s.RideSeconds += s.Ended - s.RideSince
	end
	if s.Window then
		s.Windows[s.Window].Seconds += s.Ended - s.WindowAt
	end
	if s.Uid then
		local built, summary = pcall(Summary, s)
		if built then
			local top = summary.reasons[1]
			if top and LEAVE_SIGNALS[top.w] then
				local entry = Log(s, "señal", "Se fue: " .. top.t)
				if entry then
					entry.Tag, entry.Weight, entry.Target = "salida", math.floor(top.w / 4), string.sub(top.t, 1, 80)
				end
			end
			Analytics.Finish(s, summary)
		else
			warn("[SessionReportService] the analytics summary for", s.Name, "failed:", summary)
			Analytics.Finish(s, { played = math.round(s.Ended - s.Started), loaded = s.Loaded, reasons = {} })
		end
	end
	if not discord then
		sessions[player] = nil
		return
	end
	local started = os.clock()
	local ok, payload = pcall(Report, s)
	if RunService:IsStudio() then
		print(`[SessionReportService] Studio: report built in {math.round((os.clock() - started) * 1e5) / 100} ms`)
		print(`[SessionReportService] Studio: {s.Name} entró con {s.CashStart}, ganó {s.Earned}, gastó {s.Spent}, se fue con {s.Final and s.Final.Cash}; de: {HttpService:JSONEncode(s.Income)}`)
	end
	sessions[player] = nil
	if ok then
		Enqueue(payload)
		if RunService:IsStudio() then
			local log = payload.embeds[2]
			print(`[SessionReportService] Studio: log {#s.Log} lines, {if log then utf8.len(log.description) else 0} characters in the message`)
			if log then
				print(log.description)
			end
		end
	else
		warn("[SessionReportService] the message for", s.Name, "failed:", payload)
	end
end

local function Leave(player: Player)
	local s = sessions[player]
	if not s then
		return
	end
	local now = os.clock()
	s.Ended = now
	Log(s, "servidor", "Se salió del juego")
	s.Mode = player:GetAttribute(ModeConfig.Attribute)
	s.RagdolledAtEnd = s.Character ~= nil and s.Character:GetAttribute("Ragdolled") == true
	s.PlayersLeft = math.max(#Players:GetPlayers() - 1, 0)
	for other, theirs in sessions do
		local friend = other ~= player and theirs.Friends[player.UserId]
		if friend then
			friend.Left = now
			Mark(theirs, `Se fue su amigo {friend.Name}`)
		end
	end
	local discord = Enabled()
	if not discord and not s.Uid then
		sessions[player] = nil
		if s.CharacterJanitor then
			s.CharacterJanitor:Destroy()
		end
		return
	end
	finishing += 1
	task.delay(FINISH_DELAY, function()
		local ok, problem = pcall(Finish, player, s, discord)
		finishing -= 1
		if not ok then
			sessions[player] = nil
			if not s.Summary then
				Analytics.Forget(s) -- (it never got to its summary: nothing of it is held)
			end
			warn("[SessionReportService] finishing:", problem)
		end
	end)
end

function SessionReportService:Init()
	DataService = Nexus:GetService("DataService")
	TutorialService = Nexus:GetService("TutorialService")
	WatchBuying()
	local ok, map = pcall(function()
		return MemoryStoreService:GetHashMap(STORE_NAME)
	end)
	pauseMap = if ok then map else nil
end

function SessionReportService:Start()
	DataService.Loaded:Connect(function(player: Player)
		local s = sessions[player]
		if s then
			OnLoaded(s, false)
		end
	end)
	DataService.Changed:Connect(OnData)
	DataService.Leaving:Connect(function(player: Player)
		local s = sessions[player]
		if s and s.Loaded then
			Capture(s)
		end
	end)
	Nexus:GetService("ScoreService").Banked:Connect(function(player: Player, points: number, combo: number)
		local s = sessions[player]
		if s then
			s.Points += points
			s.BestCombo = math.max(s.BestCombo, combo)
		end
	end)
	MarketplaceService.PromptProductPurchaseFinished:Connect(function(userId: number, productId: number, bought: boolean)
		local player = Players:GetPlayerByUserId(userId)
		local s = player and sessions[player]
		if s and not bought then
			Cancelled(s, InfoOf(productId, Enum.InfoType.Product).Name)
		end
	end)
	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player: Player, pass: number, bought: boolean)
		local s = sessions[player]
		if not s then
			return
		end
		local info = InfoOf(pass, Enum.InfoType.GamePass)
		if bought then
			s.Robux += info.Robux
			table.insert(s.RobuxBought, `**{info.Name}**: R$ {info.Robux}`)
			Mark(s, `Compró con Robux: {info.Name}`)
		else
			Cancelled(s, info.Name)
		end
	end)

	self.Client.Window:Connect(function(player: Player, name: string?)
		local s = sessions[player]
		if s and name ~= s.Window then
			SetWindow(s, name)
		end
	end)
	self.Client.Pulse:Connect(function(player: Player, pulse: { [string]: any })
		local s = sessions[player]
		if not s then
			return
		end
		local before = s.Pulse
		s.Pulse = pulse
		if before and before.Menu and not pulse.Menu and not s.PlayAt then
			s.PlayAt = os.clock()
			Mark(s, "Le dio a PLAY")
		end
		if pulse.Focused and pulse.Fps > 0 then
			s.FpsSum += pulse.Fps
			s.FpsCount += 1
		end
		local ping = player:GetNetworkPing() * 1000
		if ping > 0 then
			s.Ping = ping
		end
		local afk = pulse.Idle >= LIMITS.AfkAfter
		if afk ~= s.Afk then
			s.Afk = afk
			Mark(s, if afk then "Se quedó AFK" else "Volvió de AFK")
		end
		Status(s, pulse)
	end)
	self.Client.Tried:Connect(function(player: Player, kind: string, id: string, why: string)
		local s = sessions[player]
		if not (s and WHY[why]) then
			return
		end
		if kind == "Lives" then
			local helmet = HelmetConfig.Find(id)
			if helmet then
				Tried(s, "Casco y lentes", `Casco {helmet.Name}`, why, helmet.Price)
			end
		elseif kind == "Trick" then
			local trick = TrickConfig.Find(id)
			if trick then
				Tried(s, "Trucos", id, why, trick.Price)
			end
		else
			local item = EquipmentConfig.Find(kind, id)
			if item then
				local label = if kind == "Glasses" then "Lentes" elseif kind == "Helmet" then "Casco" else kind
				Tried(s, "Casco y lentes", `{label} {item.Name}`, why, item.Price)
			end
		end
	end)

	self.Client.Look:Connect(function(player: Player, packet: buffer)
		local s = sessions[player]
		if s then
			Analytics.Look(s, packet)
		end
	end)
	self.Client.Near:Connect(function(player: Player, packet: buffer)
		local s = sessions[player]
		if s then
			Analytics.Near(s, packet)
		end
	end)

	self.Client.Trail:Connect(function(player: Player, list: { { [string]: any } })
		local s = sessions[player]
		if not s then
			return
		end
		local latest = workspace:GetServerTimeNow() - s.ServerStart + 1
		for _, entry in list do
			local text = string.gsub(entry.X, "%c", " ")
			if utf8.len(text) == nil then
				text = string.gsub(text, "[\128-\255]", "?") -- (not text: what a client can't send honestly)
			end
			Log(s, entry.K, text, math.clamp(entry.T - s.ServerStart, 0, latest))
		end
	end)

	Analytics.Start({ Log = Log, WindowName = WindowName, Time = Time, Tutorial = TutorialNow })
	Players.PlayerAdded:Connect(Join)
	for _, player in Players:GetPlayers() do
		Join(player)
	end
	Players.PlayerRemoving:Connect(Leave)

	if Enabled() then
		task.spawn(function()
			local ok, problem = pcall(function()
				MessagingService:SubscribeAsync(TOPIC, function(message: any)
					local data = message.Data
					if type(data) ~= "table" then
						return
					end
					if data.Clear then
						pausedUntil = 0
					elseif type(data.Until) == "number" then
						Hold(data.Until)
					end
				end)
			end)
			if not ok then
				warn("[SessionReportService] couldn't subscribe to the pause:", problem)
			end
		end)
	end
	game:BindToClose(function()
		closing = true
		if not Enabled() then
			return
		end
		local deadline = os.clock() + CONFIG.CloseWait
		task.wait(FINISH_DELAY * 2)
		while (working or finishing > 0 or #queue > 0) and os.clock() < deadline do
			task.wait(0.1)
		end
	end)
end

return SessionReportService
