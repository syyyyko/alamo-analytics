--[[
	SessionReportConfig (server only: ServerScriptService never reaches a client, so the webhook's address stays here):
	the numbers of SessionReportService, the Discord message for each player who leaves (2026-11-09).
	The webhook goes through the proxy's /queue, which keeps to Discord's own rate limit by itself.
	Studio sends nothing unless the Workspace attribute SessionReportTest is true (every Stop would post otherwise).
	Studio tests of the pause: Workspace attribute SessionReportTestStatus (a number: answers as if the webhook had said
	that, 429 say) and SessionReportTestPause (seconds the pause lasts, instead of Pause.Base).
--]]
return {
	Webhook = "",
	Username = "Night Wheels - Salidas",

	StudioAttribute = "SessionReportTest",
	TestStatus = "SessionReportTestStatus",
	TestPause = "SessionReportTestPause",

	Colors = {
		First = 0x2ECC71, -- green: their first time
		Returning = 0xE67E22, -- orange: they'd played before
		NotLoaded = 0x95A5A6, -- grey: gone before their data came in
		Pause = 0xF1C40F, -- yellow: the notice of a pause
	},

	Spacing = 1.5, -- seconds between this server's messages
	ClosingSpacing = 0.3, -- ...while the server shuts down
	CloseWait = 20, -- seconds a closing server waits for its last messages
	QueueMax = 40, -- messages this server keeps waiting (more: the oldest let go)
	Tries = 2, -- tries for a message when the webhook doesn't answer or answers 5xx (only one blip doesn't stop every server)
	RetryWait = 2, -- seconds between them
	Slow = 15, -- seconds: an answer taking longer counts as saturated

	-- Saturated (no answer, too slow, 429, 5xx, 401, 403, 404): EVERY server stops (the state's in a MemoryStore, told at
	-- once by MessagingService) for Base seconds, doubling each time the try after it fails, up to Max. Then one server
	-- tries, with the notice of the pause as its message: it getting through is what starts them all again.
	Pause = {
		Base = 5 * 60,
		Max = 60 * 60,
		Check = 20, -- seconds between a paused server's looks at the state
		Jitter = 10, -- (plus up to this, so the servers don't all look at once)
		ProbeHold = 45, -- seconds one server has the try to itself
		Expiry = 6 * 60 * 60, -- seconds the state is kept with nobody touching it
	},

	FriendPages = 5, -- pages of the player's friends read (50 a page)
	Timeline = 8, -- the last things they did, in the message
	FieldMax = 1000, -- characters a field (Discord: 1,024)

	-- What makes a reason for leaving (seconds, unless it says otherwise)
	Limits = {
		AfkAfter = 60, -- no input this long: AFK
		AfkLeave = 120, -- AFK this long as they left: that's why
		RobloxKick = 19 * 60, -- ...this long: Roblox's own idle kick (20 minutes)
		AfterCancel = 30, -- left this soon after shutting a Robux purchase
		AfterCrash = 15,
		AfterBusted = 20,
		Mounting = 3, -- left this soon after getting on (the climbing-on animation)
		TutorialStuck = 75, -- this long on one step
		WindowStuck = 45, -- this long with one window open
		StuckClicks = 3, -- clicks in it without it changing, on top of that: stuck
		OnFoot = 30, -- on foot this long with a bike to take out
		NoBike = 90, -- this long in the game with no bike
		AfterFriend = 60, -- left this soon after a friend did
		AfterPoor = 60, -- left this soon after not having enough for something
		CrashWindow = 5 * 60,
		ManyCrashes = 4, -- crashes in CrashWindow
		ManyDeaths = 3,
		LowFps = 20, -- FPS on average (only while the window had focus)
		HighPing = 400, -- ms
		Short = 45, -- gone before this: barely tried it
		Long = 15 * 60, -- played this long: probably just done
	},

	-- What each window is called in the message (none: its own name)
	Windows = {
		Garage = "Garage",
		Dealership = "Concesionario",
		Shop = "Tienda",
		Equipment = "Equipamiento",
		Tricks = "Trucos",
		Teleports = "Teleports",
		Quests = "Quests",
		Party = "Party",
		Settings = "Ajustes",
		Customization = "Tuning",
		Difficulty = "Dificultad",
		RunResult = "Resultado de persecución",
		Daily = "Daily login",
		Records = "Récords",
		RecordPrompt = "Aviso de récord",
		RaceSetup = "Crear carrera",
		Servers = "Servers",
		Unlocked = "NEW UNLOCKED",
		Summary = "Resumen de choque",
		Admin = "Admin",
		FirstBike = "Elegir primera moto",
		Gift = "Regalo",
		Event = "Evento",
		Radio = "Radio",
		RoadInvite = "Invitación a la carretera",
	},

	-- What each tutorial step asks for, by its funnel name (a step's Name, else its Id: TutorialConfig)
	Steps = {
		Dealership = "ir al concesionario",
		PickFree = "elegir la moto gratis",
		Buy = "presionar BUY",
		Close = "cerrar con BACK / CONTINUE", -- (A's 4th: the dealership's BACK; B's 8th, Id Close too: NEW UNLOCKED!'s CONTINUE)
		Garage = "abrir el GARAGE",
		PickOwned = "elegir su moto",
		Spawn = "presionar SPAWN",
		Bay = "entrar al TUNING BAY",
		Upgrade = "mejorar el EXHAUST gratis",
		Road = "ir a la carretera",
		Earn = "farmear $800",
		Teleport = "abrir TELEPORTS",
		TeleportPick = "elegir DEALERSHIP y GO",
		WalkIn = "entrar al círculo verde",
		PickNext = "elegir la Ninza 300",
		BuyNext = "comprar la Ninza 300",
		CloseNext = "cerrar con CONTINUE",
		GarageNext = "abrir el GARAGE otra vez",
		PickNew = "elegir la moto nueva",
		SpawnNew = "presionar SPAWN con la nueva",
		PickStarter = "elegir su primera moto",
		Farm = "farmear $800",
	},
}
