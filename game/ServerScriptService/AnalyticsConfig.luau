--[[
	AnalyticsConfig (server only): where SessionReportService.Analytics sends every session as it happens, the game's own
	analytics backend (2026-11-11, the user: "un servidor propio ... que reciba todo de cada sesión y lo muestre mejor").
	The backend is a Cloudflare Worker (folder roblox-luau/NightWheelsAnalytics); Key is its INGEST_KEY secret.
	Studio sends nothing unless the Workspace attribute AnalyticsTest is true.
--]]
return {
	Url = "", -- the Worker, no slash at the end ("": off)
	Dashboard = "", -- the dashboard, for the Discord report's link
	-- The Worker's INGEST_KEY: paste it from roblox-luau/NightWheelsAnalytics/.ingest-key ("": nothing is sent).
	-- (Local tests against `wrangler dev`: Url http://127.0.0.1:8787 and the key in .dev.vars.)
	Key = "",

	Tick = 10, -- seconds between looks (sends, signals)
	-- A session goes ONCE, when the player leaves (2026-11-12, the user: "mandarlo cuando el jugador se sale y ya? asi
	-- seria menos escrituras, 1 por jugador"); a long one also every Every seconds, so a server going down loses at most
	-- that much and its memory stays small. (60 s till 2026-11-12: a row write per send in D1, 100,000 a day free.)
	Every = 1200,
	MaxLines = 3000, -- lines in one request at most (the rest the next tick: one encode stays a few ms)
	MaxSessions = 4, -- sessions in one request at most
	MaxPending = 6000, -- lines a session holds at most till it's sent (the oldest go first; past 80% it goes early)
	MaxEnded = 40, -- sessions over and not sent yet, kept at most (the oldest go first)
	Slow = 12, -- seconds: an answer slower than this pauses sending as if it had failed
	CloseWait = 20, -- seconds a closing server waits for the last sends

	-- Phase 2, the replay (2026-11-11): the SERVER samples where each player is (the client does nothing for it); the
	-- client only adds its camera and cursor, 2 a second, in one 69-byte packet every 5 s, and (2026-11-12) while riding
	-- the police and the nearest cars round it, 2 a second, one packet every 5 s. Kept 7 days by the backend.
	Track = {
		Every = 0.25, -- seconds between samples (4 a second: the web replay smooths between them)
		Absolute = 40, -- a full position every this many samples (the rest are small differences)
		MaxBytes = 262144, -- samples a session holds at most till it's sent (then sampling pauses; ~55 KB in 20 min)
		LookMax = 65536, -- camera/cursor bytes a session holds at most (~16 KB in 20 min)
		NearMax = 196608, -- traffic/police bytes a session holds at most (~60-110 KB in 20 min of riding)
	},

	-- Every server stops sending while the backend is down or saturated (as the Discord report does)
	Pause = {
		Base = 60, -- seconds, the first time; doubles each time in a row
		Max = 1800,
		Look = 15, -- seconds between looks at the shared state
		ProbeHold = 30, -- seconds one server holds the try once the pause is over
		Expiry = 3 * 3600, -- seconds the shared state lives
	},

	-- Signals: things that look like the player struggling. Each one is a line (kind 'señal') with its weight: the
	-- dashboard lists first the sessions whose weights add up to the most ("Para revisar")
	Signals = {
		Rage = 15, -- 3 clicks or taps on the same thing within 3 s
		Dead = 8, -- 2 clicks on something that isn't a button
		StuckWindow = 20, -- a window open and OutClicks clicks/keys trying to leave it within OutWindow seconds
		OutClicks = 4,
		OutWindow = 8,
		UTurn = 8, -- UTurns windows closed within UTurnOpen seconds of opening, within a minute
		UTurns = 3,
		UTurnOpen = 1.5,
		Away = 25, -- walked or rode away from the tutorial's goal (the client sees it)
		SlowStep = 12, -- SlowAfter seconds on one tutorial step
		SlowAfter = 120,
		Stuck = 20, -- wants to move and doesn't (the client sees it)
		Error = 8, -- a script error on their client (ErrorsMax counted per session)
		ErrorsMax = 5,
		Max = 40, -- signals per session at most
		Repeat = 60, -- seconds before the same signal about the same thing counts again
	},

	StudioAttribute = "AnalyticsTest",
	TestStatus = "AnalyticsTestStatus", -- (Studio) a number: answer as if the backend had said it
	TestPause = "AnalyticsTestPause", -- (Studio) seconds: the pause's length
}
