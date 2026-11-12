--[[
	Tools.WorldExport: the map in blocks for the analytics dashboard's 3D replay (2026-11-11, the user: "leer el mapa y
	hacerlo blocky en la web con texturas ... si hay cambios de estructura yo te aviso y vuelves a leerlo").
	Run it IN PLAY (only game scripts can use HttpService), from a server Script or the command bar's server side:
		require(game.ServerStorage.Tools.WorldExport).Upload()
	It reads the folders below, keeps the parts big enough to matter (FOLDERS: Min = smallest side that counts), and sends
	them to the backend (AnalyticsConfig Url + Key) in parts; the backend joins them into the 'world' the dashboard draws.
	A box: x, y, z, size x, y, z (studs, rounded), rotation x, y, z (degrees), material (place in Materials), colour
	(0xRRGGBB). Nothing in the place is changed.
--]]
local HttpService = game:GetService("HttpService")
local ServerScriptService = game:GetService("ServerScriptService")

local FOLDERS = {
	{ Name = "Roads", Min = 60 },
	{ Name = "Sidewalks", Min = 20 },
	{ Name = "Props", Min = 20, Volume = 800 },
	{ Name = "TerrainParts", Min = 80 },
	{ Name = "Map", Min = 3 }, -- (the lobby: small things matter there)
	{ Name = "Dealership", Min = 2 },
	{ Name = "TuningBays", Min = 2 },
	{ Name = "Podiums", Min = 4 },
	{ Name = "Leaderboards", Min = 4 },
	{ Name = "TunelSubterraneo", Min = 10 },
	{ Name = "Model", Min = 10 },
	{ Name = "GasStationPump", Min = 10 },
}
local PART_CHARS = 120000 -- characters a request
-- Small pieces kept: a model or folder with the attribute MapDetail (a number: the smallest side that counts in it, in
-- place of its folder's Min; true: DETAIL_MIN) keeps them, e.g. a curved kerb made of short slabs and line bits
-- (2026-11-12, the dealership's new corners, Roads...Esquina_Curva_Dealership and _2: the user, "cambie un poco la calle
-- del dealership" and the map didn't show it)
local DETAIL_MIN = 2
-- Curved unions: one box their size drew a curved kerb, a round roof or floor as a solid square. One that fills less than
-- TRACE_FILL of its box from above (an 8x8 probe of rays) is traced instead: rays straight down every RASTER studs, each
-- row's hits joined into strips RASTER deep and RASTER_THICK tall, their tops where they hit. Bigger than TRACE_MAX: a box
local TRACE_FILL = 0.7
local TRACE_MAX = 200
local RASTER = 2
local RASTER_THICK = 1

local WorldExport = {}

-- A part's own box from above: its corners' extent, and its top
local function Extent(part: BasePart): (number, number, number, number, number, number)
	local cf, half = part.CFrame, part.Size / 2
	local minX, maxX, minZ, maxZ, minY, maxY = math.huge, -math.huge, math.huge, -math.huge, math.huge, -math.huge
	for _, sx in { -1, 1 } do
		for _, sy in { -1, 1 } do
			for _, sz in { -1, 1 } do
				local w = cf * Vector3.new(half.X * sx, half.Y * sy, half.Z * sz)
				minX, maxX = math.min(minX, w.X), math.max(maxX, w.X)
				minZ, maxZ = math.min(minZ, w.Z), math.max(maxZ, w.Z)
				minY, maxY = math.min(minY, w.Y), math.max(maxY, w.Y)
			end
		end
	end
	return minX, maxX, minZ, maxZ, minY, maxY
end

function WorldExport.Build(): (string, number)
	local materials, materialIndex = {}, {}
	local boxes = {}
	local count, seen = 0, 0
	local traced = 0
	local function emit(position: Vector3, size: Vector3, rx: number, ry: number, rz: number, material: Enum.Material, c: Color3)
		local name = material.Name
		local index = materialIndex[name]
		if not index then
			table.insert(materials, name)
			index = #materials - 1
			materialIndex[name] = index
		end
		table.insert(boxes, string.format("%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d",
			math.round(position.X), math.round(position.Y), math.round(position.Z),
			math.max(1, math.round(size.X)), math.max(1, math.round(size.Y)), math.max(1, math.round(size.Z)),
			math.round(math.deg(rx)), math.round(math.deg(ry)), math.round(math.deg(rz)), index,
			math.round(c.R * 255) * 65536 + math.round(c.G * 255) * 256 + math.round(c.B * 255)))
		count += 1
	end
	-- MapDetail on it or a model / folder it's in (up to the exported folder), found once per parent
	local detailOf: { [Instance]: number | false } = {}
	local function detail(parent: Instance, folder: Instance): number?
		local known = detailOf[parent]
		if known ~= nil then
			return known or nil
		end
		local found: number | false = false
		local node: Instance? = parent
		while node and node ~= folder.Parent do
			local value = node:GetAttribute("MapDetail")
			if value == true then
				found = DETAIL_MIN
				break
			elseif type(value) == "number" then
				found = value
				break
			end
			node = node.Parent
		end
		detailOf[parent] = found
		return found or nil
	end
	local rays = RaycastParams.new()
	rays.FilterType = Enum.RaycastFilterType.Include
	-- a curved union in strips (true), or nothing done (false: it fills its box, or it's too big: a box)
	local function trace(part: BasePart): boolean
		local minX, maxX, minZ, maxZ, minY, maxY = Extent(part)
		if math.max(maxX - minX, maxZ - minZ) > TRACE_MAX then
			return false
		end
		rays.FilterDescendantsInstances = { part }
		local from, down = maxY + 2, Vector3.new(0, -(maxY - minY + 4), 0)
		local hits = 0
		for i = 0, 7 do
			for j = 0, 7 do
				local x, z = minX + (i + 0.5) / 8 * (maxX - minX), minZ + (j + 0.5) / 8 * (maxZ - minZ)
				if workspace:Raycast(Vector3.new(x, from, z), down, rays) then
					hits += 1
				end
			end
		end
		if hits / 64 >= TRACE_FILL then
			return false
		end
		local material, color = part.Material, part.Color
		for z = math.floor(minZ / RASTER) * RASTER + RASTER / 2, maxZ, RASTER do
			local startX: number?, endX, top = nil, 0, 0
			local function flush()
				if startX then
					emit(Vector3.new((startX + endX) / 2, top - RASTER_THICK / 2, z), Vector3.new(endX - startX + RASTER, RASTER_THICK, RASTER), 0, 0, 0, material, color)
					startX = nil
				end
			end
			for x = math.floor(minX / RASTER) * RASTER + RASTER / 2, maxX, RASTER do
				local hit = workspace:Raycast(Vector3.new(x, from, z), down, rays)
				if hit and startX and math.abs(hit.Position.Y - top) > 1 then
					flush() -- (a step up or down: a strip of its own)
				end
				if hit then
					if not startX then
						startX, top = x, hit.Position.Y
					end
					endX = x
					top = math.max(top, hit.Position.Y)
				else
					flush()
				end
			end
			flush()
		end
		traced += 1
		return true
	end
	for _, spec in FOLDERS do
		local folder = workspace:FindFirstChild(spec.Name)
		if folder then
			for _, part in folder:GetDescendants() do
				seen += 1
				if seen % 4000 == 0 then
					task.wait()
				end
				if part:IsA("BasePart") and part.Transparency < 0.6 then
					local size = part.Size
					local big = math.max(size.X, size.Y, size.Z)
					local fine = detail(part.Parent :: Instance, folder)
					local min = fine or spec.Min
					if big >= min and (fine or not spec.Volume or size.X * size.Y * size.Z >= spec.Volume) then
						if not (part:IsA("UnionOperation") and trace(part)) then
							local cf = part.CFrame
							local rx, ry, rz = cf:ToOrientation()
							emit(cf.Position, size, rx, ry, rz, part.Material, part.Color)
						end
					end
				end
			end
		end
	end
	print(`[WorldExport] curved unions traced in strips: {traced}`)
	local zones = {}
	local teleports = workspace:FindFirstChild("Teleports")
	if teleports then
		for _, spot in teleports:GetChildren() do
			if spot:IsA("BasePart") then
				table.insert(zones, { n = spot.Name, x = math.round(spot.Position.X), y = math.round(spot.Position.Y), z = math.round(spot.Position.Z) })
			end
		end
	end
	local head = HttpService:JSONEncode({ v = 1, made = os.time(), materials = materials, zones = zones })
	-- (the boxes joined by hand: one flat list of numbers, much smaller than tables)
	return string.sub(head, 1, -2) .. ',"boxes":[' .. table.concat(boxes, ",") .. "]}", count
end

function WorldExport.Upload(): string
	local config = require(ServerScriptService.AnalyticsConfig)
	assert(config.Url ~= "" and config.Key ~= "", "AnalyticsConfig needs Url and Key")
	local json, count = WorldExport.Build()
	local parts = math.ceil(#json / PART_CHARS)
	for part = 1, parts do
		local response = HttpService:RequestAsync({
			Url = config.Url .. "/ingest/world",
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json", ["X-Key"] = config.Key },
			Body = HttpService:JSONEncode({ part = part, parts = parts, data = string.sub(json, (part - 1) * PART_CHARS + 1, part * PART_CHARS) }),
			Compress = Enum.HttpCompression.Gzip,
		})
		if not response.Success then
			error(`[WorldExport] part {part}/{parts}: HTTP {response.StatusCode} {string.sub(response.Body, 1, 200)}`)
		end
	end
	local done = `[WorldExport] {count} boxes, {#json} characters, sent in {parts} parts`
	print(done)
	return done
end

return WorldExport
