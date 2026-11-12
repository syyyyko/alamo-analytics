--[[
	SessionReportController (client): what only the player's own client knows for the Discord message as they leave
	(Services.SessionReportService, 2026-11-09): the window open, how long since they last touched anything, the clicks
	since the window changed, FPS, whether they're still in the main menu, in a cinematic or teleporting away, and the
	device. Sent every PULSE_EVERY seconds and as soon as a window or one of those changes: nothing can be sent as a
	player leaves, so the last one sent has to be close to how things were.
	The trail for the full log (2026-11-11, the user: "dame un .txt ... para ver todos los steps que hizo ... bien
	preciso"): the keys and gamepad buttons pressed (riding's own left out: they're pressed all the time), each click or
	tap with the button under it (its place in the UI and what it says) or nothing, and the prompts used, each with the
	server's time, sent in batches every TRAIL_EVERY seconds. A click asks the UI what's under it once; nothing runs
	per frame but a counter.
	A window that won't even ask the server (not enough cash on its own count) says so with :Tried.
	For the analytics backend's signals (2026-11-11: "perfiles recomendados para revisar ... que en un step se fueron
	caminando a una parte"), once a second, a few numbers: trying to move (walk input, the bike's throttle) and not
	getting anywhere ("trabado"); walking or riding away from the tutorial's waypoint, its distance growing well past the
	closest it got ("alejo"). And this client's script errors ("error", the first few, each once).
--]]
local GuiService = game:GetService("GuiService")
local LogService = game:GetService("LogService")
local Players = game:GetService("Players")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Nexus = require(ReplicatedStorage.Packages.Nexus)

local PULSE_EVERY = 5 -- seconds
local TRAIL_EVERY = 1.5 -- seconds between batches of keys and clicks
local TRAIL_MAX = 30 -- in one batch at most (more is someone mashing: the rest let go)
local TEXT_MAX = 100 -- characters of what a line says
local AFK_AFTER = 60 -- seconds with no input (as SessionReportConfig's Limits.AfkAfter)
local STICK_MOVED = 0.2 -- how far a gamepad's stick or trigger counts as touching it
local GAMEPADS = {
	[Enum.UserInputType.Gamepad1] = true,
	[Enum.UserInputType.Gamepad2] = true,
	[Enum.UserInputType.Gamepad3] = true,
	[Enum.UserInputType.Gamepad4] = true,
}
local FLAGS = { Menu = "MainMenu", Cinematic = "Cinematic", Watching = "WatchingRun", RaceGarage = "RaceGarage" } -- the player's attributes
-- riding's own keys and buttons: pressed all the time, they'd bury the rest
local RIDING_KEYS = {
	[Enum.KeyCode.W] = true, [Enum.KeyCode.A] = true, [Enum.KeyCode.S] = true, [Enum.KeyCode.D] = true,
	[Enum.KeyCode.Up] = true, [Enum.KeyCode.Down] = true, [Enum.KeyCode.Left] = true, [Enum.KeyCode.Right] = true,
	[Enum.KeyCode.LeftShift] = true, [Enum.KeyCode.RightShift] = true, [Enum.KeyCode.Unknown] = true,
	[Enum.KeyCode.ButtonR2] = true, [Enum.KeyCode.ButtonL2] = true,
	[Enum.KeyCode.Thumbstick1] = true, [Enum.KeyCode.Thumbstick2] = true,
}
local RIDING_UI = { SteerPad = true, Pedals = true } -- (the phone's steering and pedals: the same)
local STUCK_SECONDS = 30 -- seconds trying to move without getting anywhere...
local STUCK_SHARE = 0.8 -- ...trying this share of them...
local STUCK_STUDS = 6 -- ...and never further than this from where it started
local STUCK_AGAIN = 180 -- seconds before it's said again
local AWAY_STUDS = 150 -- studs further from the tutorial's waypoint than the closest they got...
local AWAY_SECONDS = 12 -- ...and this long since they were closest
local ERRORS_MAX = 8 -- script errors sent per session
local LOOK_EVERY = 0.5 -- seconds between camera/cursor samples for the replay (where the player is, the server samples)
local LOOK_BATCH = 10 -- samples in one packet (one every 5 s, 69 bytes)
-- While riding, the police and the cars round the player for the replay (2026-11-12, the user: "pongas los carros de
-- trafico, al menos los del carril que va el, y la policia tambien"): the same 2 a second, one packet every 5 s
local NEAR_BATCH = 10 -- samples in one packet at most
local NEAR_MAX = 8 -- cars in one sample at most: the police first, then the nearest
local NEAR_STUDS = 260 -- how far round the player a car counts (the police: twice that)

local SessionReportController = {}

local player = Players.LocalPlayer
local service: any = nil
local lastInput = os.clock()
local clicks = 0
local frames = 0
local pulsedAt = os.clock()
local afk = 0
local wasAfk = false
local focused = true
local teleporting = false
local device: string? = nil -- (worked out once: it doesn't change)
local trail: { { [string]: any } } = {}
local moves: { { [string]: any } } = {} -- the last STUCK_SECONDS seconds: { At = where, Trying = bool }
local stuckAgain = 0
local goal: { [string]: any }? = nil -- the tutorial's waypoint followed: { Name, Closest, ClosestAt, Said }
local errorsSeen: { [string]: boolean } = {}
local errorsSent = 0
local look: buffer? = nil -- the packet being filled
local lookCount, lookLast = 0, 0
local near: buffer? = nil -- the same for the cars round the player
local nearCount, nearLen, nearStart = 0, 0, 0
local nearIds: { [Model]: number } = setmetatable({}, { __mode = "k" }) :: any -- each car's number in the packets (0-255, reused)
local nextNearId = 0
local traffic: any, chase: any = nil, nil -- TrafficController, ChaseController

local function Device(): string
	if GuiService:IsTenFootInterface() then
		return "Console"
	end
	if UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled then
		local camera = workspace.CurrentCamera
		local size = if camera then camera.ViewportSize else Vector2.zero
		return if math.min(size.X, size.Y) >= 600 then "Tablet" else "Phone"
	end
	return "PC"
end

local function Cut(text: string): string
	if (utf8.len(text) or #text) <= TEXT_MAX then
		return text
	end
	return string.sub(text, 1, (utf8.offset(text, TEXT_MAX + 1) or TEXT_MAX + 1) - 1)
end

-- One line for the full log, stamped with the server's time
local function Note(kind: string, text: string)
	if #trail < TRAIL_MAX then
		table.insert(trail, { T = workspace:GetServerTimeNow(), K = kind, X = Cut(text) })
	end
end

-- A piece of UI as the log says it: its last three names and what it says
local function Describe(object: GuiObject): string
	local names = {}
	local node: Instance? = object
	while node and not node:IsA("LayerCollector") and #names < 3 do
		table.insert(names, 1, node.Name)
		node = node.Parent
	end
	local label: any = if object:IsA("TextButton") and object.Text ~= "" then object else object:FindFirstChildWhichIsA("TextLabel", true)
	local text = if label then string.gsub(label.Text, "<[^>]+>", "") else ""
	if text ~= "" then
		return table.concat(names, " > ") .. ` "{string.sub(text, 1, 24)}"`
	end
	return table.concat(names, " > ")
end

-- Something you can see that isn't laid over the whole screen (the HUD's vignette, a see-through section frame)
local function Solid(object: GuiObject): boolean
	local camera = workspace.CurrentCamera
	local screen = if camera then camera.ViewportSize else Vector2.zero
	if object.AbsoluteSize.X >= screen.X * 0.9 and object.AbsoluteSize.Y >= screen.Y * 0.8 then
		return false
	end
	if object.BackgroundTransparency < 0.95 then
		return true
	end
	if (object:IsA("ImageLabel") or object:IsA("ImageButton")) and object.Image ~= "" and object.ImageTransparency < 0.95 then
		return true
	end
	return (object:IsA("TextLabel") or object:IsA("TextButton")) and object.Text ~= "" and object.TextTransparency < 0.95
end

local function OnRidingControls(object: Instance): boolean
	local node: Instance? = object
	while node and not node:IsA("LayerCollector") do
		if RIDING_UI[node.Name] then
			return true
		end
		node = node.Parent
	end
	return false
end

-- A click or tap: the button under it, else what's there, else (a click) the world
local function ClickAt(position: Vector3, kind: string)
	local gui = player:FindFirstChildOfClass("PlayerGui")
	if not gui then
		return
	end
	local ok, objects = pcall(function()
		return gui:GetGuiObjectsAtPosition(position.X, position.Y)
	end)
	if not ok then
		return
	end
	local button, top = nil, nil
	for _, object in objects do
		if not button and object:IsA("GuiButton") then
			button = object
		end
		if not top and Solid(object) then
			top = object
		end
	end
	local hit = button or top
	if hit and OnRidingControls(hit) then
		return
	end
	if button then
		Note(kind, Describe(button))
	elseif top then
		Note(kind, `sin botón, sobre {Describe(top)}`)
	elseif kind == "clic" then
		Note(kind, "en el mundo")
	end
end

-- Once a second: stuck, or walking away from where the tutorial sends them
local function Watch()
	local character = player.Character
	local root = character and character.PrimaryPart
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not (root and humanoid) or humanoid.Health <= 0 then
		table.clear(moves)
		return
	end
	local here = root.Position
	local busy = player:GetAttribute("MainMenu") == true or player:GetAttribute("Cinematic") == true
		or player:GetAttribute("WatchingRun") == true

	local seat = humanoid.SeatPart
	local trying = humanoid.MoveDirection.Magnitude > 0.1
		or (seat ~= nil and seat:IsA("VehicleSeat") and math.abs(seat.ThrottleFloat) > 0.1)
	table.insert(moves, { At = here, Trying = trying and not busy })
	if #moves > STUCK_SECONDS then
		table.remove(moves, 1)
	end
	if #moves == STUCK_SECONDS and os.clock() >= stuckAgain then
		local tries, furthest = 0, 0
		local from = moves[1].At
		for _, move in moves do
			if move.Trying then
				tries += 1
			end
			furthest = math.max(furthest, (move.At - from).Magnitude)
		end
		if tries >= STUCK_SECONDS * STUCK_SHARE and furthest < STUCK_STUDS then
			Note("trabado", `Quiere moverse y no avanza: {STUCK_SECONDS}s ` .. (if seat then "en moto" else "a pie"))
			stuckAgain = os.clock() + STUCK_AGAIN
			table.clear(moves)
		end
	end

	local gui = player:FindFirstChildOfClass("PlayerGui")
	local waypoint = gui and gui:FindFirstChild("Waypoint")
	local spot = workspace.Terrain:FindFirstChild("TutorialWaypoint")
	if not (waypoint and waypoint:IsA("BillboardGui") and waypoint.Enabled and spot and spot:IsA("Attachment")) or busy then
		goal = nil
		return
	end
	local label = waypoint:FindFirstChild("Label", true)
	local name = if label and label:IsA("TextLabel") then string.match(label.Text, "^(.-) %- ") or label.Text else "?"
	local away = spot.WorldPosition - here
	local distance = Vector2.new(away.X, away.Z).Magnitude
	local now = os.clock()
	if not goal or goal.Name ~= name then
		goal = { Name = name, Closest = distance, ClosestAt = now, Said = false }
	end
	local followed = goal :: { [string]: any }
	if distance < followed.Closest then
		followed.Closest, followed.ClosestAt = distance, now
	end
	if not followed.Said and distance - followed.Closest >= AWAY_STUDS and now - followed.ClosestAt >= AWAY_SECONDS then
		Note("alejo", `Se alejó de {name}: de {math.round(followed.Closest)} a {math.round(distance)} studs` .. (if seat then " en moto" else " a pie"))
		-- (said again only if they go another AWAY_STUDS further)
		followed.Closest, followed.ClosestAt = distance, now
	end
end

-- Twice a second for the replay: where the camera looks and where the cursor is (a few numbers into a buffer)
local function Look()
	local camera = workspace.CurrentCamera
	if not (camera and service) then
		return
	end
	local now = workspace:GetServerTimeNow()
	if not look or lookCount == 0 then
		look = buffer.create(9 + 6 * LOOK_BATCH)
		buffer.writef64(look :: buffer, 0, now)
		lookLast = now
	end
	local packet = look :: buffer
	local direction = camera.CFrame.LookVector
	local size = camera.ViewportSize
	local mouse = UserInputService:GetMouseLocation()
	local o = 9 + lookCount * 6
	buffer.writeu8(packet, o, math.clamp(math.round((now - lookLast) * 20), 0, 255))
	buffer.writeu8(packet, o + 1, math.floor(((math.atan2(-direction.X, -direction.Z) / (2 * math.pi)) % 1) * 256) % 256)
	buffer.writei8(packet, o + 2, math.clamp(math.round(math.deg(math.asin(math.clamp(direction.Y, -1, 1)))), -90, 90))
	buffer.writeu8(packet, o + 3, if size.X > 0 then math.clamp(math.round(mouse.X / size.X * 254), 0, 254) else 255)
	buffer.writeu8(packet, o + 4, if size.Y > 0 then math.clamp(math.round(mouse.Y / size.Y * 254), 0, 254) else 255)
	buffer.writeu8(packet, o + 5, (if UserInputService.MouseIconEnabled then 1 else 0) + (if UserInputService.TouchEnabled and not UserInputService.MouseEnabled then 2 else 0))
	lookLast = now
	lookCount += 1
	if lookCount >= LOOK_BATCH then
		buffer.writeu8(packet, 8, lookCount)
		service.Look:Fire(packet)
		lookCount = 0 -- (a new buffer next time: the one sent is never touched again)
	end
end

-- The cars round the player, twice a second while riding: one sample into the packet; it goes when full or 5 s old
local function NearSend()
	if near and nearCount > 0 then
		local packet = buffer.create(nearLen)
		buffer.copy(packet, 0, near :: buffer, 0, nearLen)
		buffer.writeu8(packet, 8, nearCount)
		service.Near:Fire(packet)
	end
	nearCount = 0
end

local function NearId(model: Model): number
	local id = nearIds[model]
	if not id then
		nextNearId = (nextNearId + 1) % 256
		id = nextNearId
		nearIds[model] = id
	end
	return id
end

local function Near()
	if not service then
		return
	end
	local now = workspace:GetServerTimeNow()
	if nearCount > 0 and now - nearStart >= 4.8 then
		NearSend()
	end
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local seat = humanoid and humanoid.SeatPart
	if not seat then
		return
	end
	local origin = seat.Position
	local found = {}
	if chase then
		for _, model in chase:GetCars() do
			if model.Parent then
				local at = model:GetPivot()
				local away = (at.Position - origin).Magnitude
				if away <= NEAR_STUDS * 2 then
					table.insert(found, { Kind = 1, Model = model, At = at, Rank = away - 1e5 })
				end
			end
		end
	end
	if traffic then
		for _, car in traffic:GetCars() do
			local root, model = car.Root, car.Model
			if root and model then
				local at = root.CFrame
				local away = (at.Position - origin).Magnitude
				if away <= NEAR_STUDS then
					table.insert(found, { Kind = 0, Model = model, At = at, Rank = away })
				end
			end
		end
	end
	table.sort(found, function(a, b)
		return a.Rank < b.Rank
	end)
	local count = math.min(#found, NEAR_MAX)
	if not near or nearCount == 0 then
		near = near or buffer.create(9 + NEAR_BATCH * (3 + 7 * NEAR_MAX))
		buffer.writef64(near :: buffer, 0, now)
		nearStart, nearLen = now, 9
	end
	local b = near :: buffer
	local o = nearLen
	buffer.writeu16(b, o, math.clamp(math.round((now - nearStart) * 1000), 0, 65535))
	buffer.writeu8(b, o + 2, count)
	o += 3
	for index = 1, count do
		local item = found[index]
		local at: CFrame = item.At
		local forward = at.LookVector
		buffer.writeu8(b, o, item.Kind)
		buffer.writeu8(b, o + 1, NearId(item.Model))
		buffer.writei16(b, o + 2, math.clamp(math.round((at.X - origin.X) * 2), -32768, 32767))
		buffer.writei16(b, o + 4, math.clamp(math.round((at.Z - origin.Z) * 2), -32768, 32767))
		buffer.writeu8(b, o + 6, math.floor(((math.atan2(-forward.X, -forward.Z) / (2 * math.pi)) % 1) * 256) % 256)
		o += 7
	end
	nearLen = o
	nearCount += 1
	if nearCount >= NEAR_BATCH then
		NearSend()
	end
end

local function Pulse()
	if not service then
		return
	end
	device = device or Device()
	local now = os.clock()
	local elapsed = now - pulsedAt
	local fps = if elapsed > 0 then frames / elapsed else 0
	frames, pulsedAt = 0, now
	if #UserInputService:GetKeysPressed() > 0 then
		lastInput = now -- (a held key fires nothing: riding straight on the throttle isn't AFK)
	end
	local idle = now - lastInput
	if idle >= AFK_AFTER then
		afk += if wasAfk then elapsed else idle
		wasAfk = true
	else
		wasAfk = false
	end
	local pulse: { [string]: any } = {
		Idle = math.floor(idle),
		Afk = math.floor(afk),
		Clicks = math.min(clicks, 9999),
		Fps = math.clamp(math.round(fps), 0, 999),
		Focused = focused,
		Teleporting = teleporting,
		Device = device,
	}
	for key, attribute in FLAGS do
		pulse[key] = player:GetAttribute(attribute) == true
	end
	service.Pulse:Fire(pulse)
end

-- A purchase its window turned down without asking the server: ("Lives" | an EQUIPMENT section | "Trick", id, why)
function SessionReportController:Tried(kind: string, id: string, why: string)
	if service then
		service.Tried:Fire(kind, id, why)
	end
end

function SessionReportController:Init() end

function SessionReportController:Start()
	service = Nexus:GetService("SessionReportService")
	local UIController = Nexus:GetController("UIController")
	pcall(function()
		traffic = Nexus:GetController("TrafficController")
		chase = Nexus:GetController("ChaseController")
	end)

	UserInputService.InputBegan:Connect(function(input: InputObject)
		lastInput = os.clock()
		local kind = input.UserInputType
		if kind == Enum.UserInputType.MouseButton1 then
			clicks += 1
			ClickAt(input.Position, "clic")
		elseif kind == Enum.UserInputType.Touch then
			clicks += 1
			ClickAt(input.Position, "toque")
		elseif kind == Enum.UserInputType.Keyboard then
			if not RIDING_KEYS[input.KeyCode] and not UserInputService:GetFocusedTextBox() then
				Note("tecla", input.KeyCode.Name)
			end
		elseif GAMEPADS[kind] and not RIDING_KEYS[input.KeyCode] then
			local selected = GuiService.SelectedObject
			if input.KeyCode == Enum.KeyCode.ButtonA and selected then
				Note("mando", "A sobre " .. Describe(selected))
			else
				Note("mando", input.KeyCode.Name)
			end
		end
	end)
	UserInputService.InputChanged:Connect(function(input: InputObject)
		local kind = input.UserInputType
		if kind == Enum.UserInputType.MouseMovement or kind == Enum.UserInputType.Touch then
			lastInput = os.clock()
		elseif GAMEPADS[kind] and input.Position.Magnitude >= STICK_MOVED then
			lastInput = os.clock()
		end
	end)
	ProximityPromptService.PromptTriggered:Connect(function(prompt: ProximityPrompt, who: Player)
		if who == player then
			Note("prompt", `{prompt.ActionText} ({if prompt.Parent then prompt.Parent.Name else "?"})`)
		end
	end)
	UserInputService.WindowFocused:Connect(function()
		focused = true
	end)
	UserInputService.WindowFocusReleased:Connect(function()
		focused = false
	end)
	RunService.Heartbeat:Connect(function()
		frames += 1
	end)
	player.OnTeleport:Connect(function(state: Enum.TeleportState)
		teleporting = state ~= Enum.TeleportState.Failed
		Pulse()
	end)
	for _, attribute in FLAGS do
		player:GetAttributeChangedSignal(attribute):Connect(Pulse)
	end
	LogService.MessageOut:Connect(function(message: string, kind: Enum.MessageType)
		if kind ~= Enum.MessageType.MessageError or errorsSent >= ERRORS_MAX then
			return
		end
		local key = string.sub(message, 1, 120)
		if errorsSeen[key] then
			return
		end
		errorsSeen[key] = true
		errorsSent += 1
		Note("error", message)
	end)
	task.spawn(function()
		while true do
			task.wait(LOOK_EVERY)
			pcall(Look)
			pcall(Near)
		end
	end)
	task.spawn(function()
		while true do
			task.wait(1)
			local ok, problem = pcall(Watch)
			if not ok and errorsSent < ERRORS_MAX then
				errorsSent += 1
				Note("error", "SessionReportController.Watch: " .. tostring(problem))
			end
		end
	end)
	UIController.Changed:Connect(function(open: string?)
		clicks = 0
		service.Window:Fire(open)
	end)
	local open = UIController:Current()
	if open then
		service.Window:Fire(open)
	end
	task.spawn(function()
		while true do
			task.wait(TRAIL_EVERY)
			if #trail > 0 then
				local batch = trail
				trail = {}
				service.Trail:Fire(batch)
			end
		end
	end)
	while true do
		Pulse()
		task.wait(PULSE_EVERY)
	end
end

return SessionReportController
