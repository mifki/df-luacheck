module.exports = {
	_type: '__context',

	guesses: {
	},

	types: {
		null: 'null',
		moduleMode: 'bool',

		coroutine: {
			_type: 'coroutine'
		},

		math: {
			_type: 'math',
			_alias: true,
			huge: 'number'
		},

		df: {
			_type: '__df',
			global: {
				_type: '__global',
				_kind: { _type: 'string', _value: 'global' },
			},
		},
		
		coord2d: {
			_type: 'coord2d',
			x: 'number',
			y: 'number',
			z: 'number',
		},

		MessagePack: {
			_type: 'MessagePack',
			NIL: 'null',
		},

		io: {
			_type: 'io',
			stdin: 'io',
			stdout: 'io',
			stderr: 'io'
		},

		'JSON': {
			_type: 'JSON',
			_methods: {
				'decode': 'table',
			},
		},

		os: {
			_type: 'os',
			clock: { _type:'function', _node:'number' },
		},

		__defclass_base: {
			ATTRS: 'table'
		},

		dfhack_flags: {
			_type:'dfhack_flags',

			enable: 'bool',
			enable_state: 'bool',
			module: 'bool',
			module_strict: 'bool',
			alias: 'string',
			alias_count: 'number',
		},

		Script: {
			_type: 'Script',
			_sub: '__defclass_base',
			_defclass: true,
			mtime: 'number',
			env: '_ENV',
			path: 'string',
			_flags: 'dfhack_flags',
			flags_mtime: 'number',

			_methods: {
				needs_update: { _type:'function', _node:'bool' },
				get_flags: { _type:'function', _node:'dfhack_flags' },
			},
		},

		__dfhack_random: {
			_type: '__dfhack_random'
		},

		dfhack: {
			_type: '__dfhack',
			VERSION: 'string',
			DF_VERSION: 'string',
			RELEASE: 'string',
			is_core_context: 'bool',
			BASE_G: '_G',

			onStateChange: {
				_type: '__EventHolder',
				_inp: 'number'
			},

			internal: {
				_type: 'dfhack.internal',
				_alias: true,
				scripts: { _type:'table', _array:'Script' },
				save_init: { _type:'_ENV[]', _array:'_ENV' },
			},

			buildings: {
				_type: 'dfhack.buildings',
				_alias: true,
				input_filter_defaults: {
					_type: 'table',
					item_type: 'number',
					item_subtype: 'number',
					mat_type: 'number',
					mat_index: 'number',
					flags1: { _type:'table', _array:'bool' },
					flags2: { _type:'table', _array:'bool' },
					flags3: { _type:'table', _array:'bool' },
					flags4: 'number',
					flags5: 'number',
					reaction_class: 'string',
					has_material_reaction_product: 'string',
					metal_ore: 'number',
					min_dimension: 'number',
					has_tool_use: 'number',
					quantity: 'number'
				}
			},

			persistent: {
				_type: 'dfhack.persistent',
				_alias: true,
				__tostring: {
					_type: 'function',
					_anyfunc: true
				}
			},

			exception: { _type:'function' }, // TODO
			penarray: { _type:'function' }, // TODO

			curry: { _type:'function' },
			safecall: { _type:'function' },

			pen: {
				_type: 'dfhack.pen',
				ch: 'string',
				fg: 'number',
				bg: 'number',
				bold: 'bool',
				tile: 'number',
				tile_color: 'bool',
				tile_fg: 'number',
				tile_bg: 'number'
			},
	
			matinfo: {
				_type: 'dfhack.matinfo',
		
				type: 'number',
				index: 'number',
				material: 'df.material',
				mode: 'number',
				subtype: 'number',
				inorganic: 'df.inorganic_raw',
				creature: 'df.creature_raw',
				plant: 'df.plant_raw',
				figure: 'df.historical_figure',
		
				_methods: {
					getCraftClass: 'df.craft_material_class',
					getToken: 'string',
					toString: 'string',
				},
			},
		},

		native: {
			itemcache: {
				cats: {
					_array: 'native.type_category',
				}
			},
	
			type_category: {
				count: 'number',
				busy: 'number',
				groups_index: {
					_array: 'native.group_info',
				},
			},
	
			group_info: {
				type: 'df.item_type',
				subtype: 'number',
				mat_type: 'number',
				mat_index: 'number',
				title: 'string',
				count: 'number',
				items: { _array:'df.item' },
				flags_all: 'df.item_flags',
				flags_some: 'df.item_flags',
			}
		},
	},

	functions: {
		error: 'none',
		qerror: 'none',
		tostring: 'string',
		tonumber: 'number',
		print: 'none',
		type: 'string',
		collectgarbage: 'none',
		load: { _type: 'tuple', _tuple: [{ _type: 'function', _node: { _type: 'tuple', _tuple: [] } }, 'string'] },

		'debug.getinfo': {
			_type: 'table',

			source: 'string',
			short_src: 'string',
			linedefined: 'number',
			what: 'string',
			name: 'string',
			namewhat: 'string',
			nups: 'number',
			func: { _type: 'function' }
		},
		'debug.getlocal': {
			_type: 'tuple',
			_tuple: ['string', 'null']
		},

		'math.abs': 'number',
		'math.floor': 'number',
		'math.ceil': 'number',
		'math.min': 'number',
		'math.max': 'number',
		'math.random': 'number',
		'math.pow': 'number',

		'table.insert': 'none',
		'table.sort': 'none',
		'table.concat': 'string',
		'table.pack': 'table',
		
		'string.gsub': 'string',
		'string.sub': 'string',
		'string.byte': 'number',
		'string.char': 'string',
		'string.find': 'number',
		'string.upper': 'string',
		'string.lower': 'string',
		'string.match': 'string',
		'string.format': 'string',
		'string.len': 'number',
		'string.rep': 'string',

		'bit32.band': 'number',
		'bit32.lshift': 'number',
		'bit32.rshift': 'number',
		'bit32.bnot': 'number',

		'io.open': { _type:'tuple', _tuple:['io', 'string', 'number'] },

		'dfhack.printerr': 'none',
		'dfhack.error': 'none',
		'dfhack.color': 'none',
		'dfhack.print': 'none',
		'dfhack.current_script_name': 'string',
		'dfhack.getOSType': 'string',
		'dfhack.getArchitecture': 'number',
		'dfhack.getArchitectureName': 'string',
		'dfhack.getDFVersion': 'string',
		'dfhack.getDFPath': 'string',
		'dfhack.getTickCount': 'string',
		'dfhack.getHackPath': 'string',
		'dfhack.isWorldLoaded': 'bool',
		'dfhack.isMapLoaded': 'bool',
		'dfhack.df2utf': 'string',
		'dfhack.utf2df': 'string',
		'dfhack.df2console': 'string',
		'dfhack.getDFHackVersion': 'string',
		'dfhack.getDFHackRelease': 'string',
		'dfhack.getCompiledDFVersion': 'string',
		'dfhack.getGitDescription': 'string',
		'dfhack.getGitCommit': 'string',
		'dfhack.getGitXmlCommit': 'string',
		'dfhack.getGitXmlExpectedCommit': 'string',
		'dfhack.gitXmlMatch': 'bool',
		'dfhack.isRelease': 'bool',
		'dfhack.isPrerelease': 'bool',
		'dfhack.timeout_active': { _type:'function', _node:'none' },
		'dfhack.lineedit': 'string',
		'dfhack.saferesume': 'bool',
		'dfhack.is_interactive': 'bool',
		'dfhack.gui.getCurViewscreen': 'df.viewscreen',
		'dfhack.gui.getSelectedItem': 'df.item',
		'dfhack.gui.showAnnouncement': 'none',
		'dfhack.gui.getFocusString': 'string',
		'dfhack.gui.getCurFocus': 'string',
		'dfhack.gui.refreshSidebar': 'bool',
		'dfhack.gui.writeToGamelog': 'none',
		'dfhack.gui.getAnyUnit': 'df.unit',
		'dfhack.random': 'number',
		'__dfhack_random.init': 'none',
		'__dfhack_random.random': 'number',
		'__dfhack_random.drandom': 'number',
		'dfhack.units.getCasteProfessionName': 'string',
		'dfhack.units.getNemesis': 'df.nemesis_record',
		'dfhack.units.getPosition': { _type:'tuple', _tuple:['number', 'number', 'number'] },
		'dfhack.units.getProfessionColor': 'number',
		'dfhack.units.getProfessionName': 'string',
		'dfhack.units.getVisibleName': 'df.language_name',
		'dfhack.units.isActive': 'bool',
		'dfhack.units.isBaby': 'bool',
		'dfhack.units.isChild': 'bool',
		'dfhack.units.isCitizen': 'bool',
		'dfhack.units.isDead': 'bool',
		'dfhack.units.isDiplomat': 'bool',
		'dfhack.units.isFemale': 'bool',
		'dfhack.units.isMale': 'bool',
		'dfhack.units.isMarkedForSlaughter': 'bool',
		'dfhack.units.isMerchant': 'bool',
		'dfhack.units.isOpposedToLife': 'bool',
		'dfhack.units.isOwnCiv': 'bool',
		'dfhack.units.isOwnGroup': 'bool',
		'dfhack.units.isOwnRace': 'bool',
		'dfhack.units.isSane': 'bool',
		'dfhack.units.setNickname': 'none',
		'dfhack.units.getNoblePositions': {
			_type: 'table',
			_array: {
				_type: 'table',
				entity: 'df.historical_entity',
				assignment: 'df.entity_position_assignment',
				position: 'df.entity_position'
			}
		},
		'dfhack.units.getMiscTrait': 'df.unit_misc_trait',
		'dfhack.units.computeMovementSpeed': 'number',
		'dfhack.units.computeSlowdownFactor': 'number',
		'dfhack.units.getAge': 'number',
		'dfhack.items.checkMandates': 'bool',
		'dfhack.items.canTrade': 'bool',
		'dfhack.items.canTradeWithContents': 'bool',
		'dfhack.items.isRouteVehicle': 'bool',
		'dfhack.items.isSquadEquipment': 'bool',
		'dfhack.items.getGeneralRef': 'df.general_ref',
		'dfhack.items.getDescription': 'string',
		'dfhack.items.getItemBaseValue': 'number',
		'dfhack.items.getValue': 'number',
		'dfhack.items.getContainedItems': { _type:'df.item[]', _array:'df.item' },
		'dfhack.items.getPosition': { _type:'tuple', _tuple:['number', 'number', 'number'] },
		'dfhack.items.getContainer': 'df.item',
		'dfhack.items.getHolderUnit': 'df.unit',
		'dfhack.items.getSubtypeCount': 'number',
		'dfhack.items.getSubtypeDef': 'df.itemdef',
		'dfhack.items.isCasteMaterial': 'bool',
		'dfhack.items.remove': 'bool',
		'dfhack.items.findType': 'number',
		'dfhack.items.findSubtype': 'number',
		'dfhack.items.createItem': 'number',
		'dfhack.items.moveToInventory': 'bool',
		'dfhack.items.moveToGround': 'bool',
		'dfhack.items.moveToBuilding': 'bool',
		'dfhack.matinfo.decode': 'dfhack.matinfo',
		'dfhack.matinfo.find': 'dfhack.matinfo',
		'dfhack.matinfo.matches': 'bool',
		'dfhack.job.getName': 'string',
		'dfhack.job.getWorker': 'df.unit',
		'dfhack.job.getGeneralRef': 'df.general_ref',
		'dfhack.job.removeWorker': 'none',
		'dfhack.job.getHolder': 'df.building',
		'dfhack.maps.getRegionBiome': 'df.region_map_entry',
		'dfhack.maps.getBlock': 'df.map_block',
		'dfhack.maps.getTileBlock': 'df.map_block',
		'dfhack.maps.ensureTileBlock': 'df.map_block',
		'dfhack.maps.getTileType': 'df.tiletype',
		'dfhack.maps.getTileFlags': { _type:'tuple', _tuple:['df.tile_designation', 'df.tile_occupancy'] },
		'dfhack.maps.isValidTilePos': 'bool',
		'dfhack.maps.spawnFlow': 'df.flow_info',
		'dfhack.maps.enableBlockUpdates': 'none',
		'dfhack.burrows.setAssignedUnit': 'none',
		'dfhack.burrows.findByName': 'df.burrow',
		'dfhack.burrows.isAssignedTile': 'bool',
		'dfhack.internal.memmove': 'none',
		'dfhack.internal.findScript': 'string',
		'dfhack.internal.getRebaseDelta': 'number',
		'dfhack.internal.setAddress': 'none',
		'dfhack.internal.getAddress': 'number',
		'dfhack.internal.getDir': { _type:'string[]', _array:'string' },
		'dfhack.internal.runCommand': { _type:'table', _array:{ _type:'table', '1':'number', '2':'string' }, status:'number' },
		'dfhack.internal.getMemRanges': { _type:'table[]', _array: { _type:'table', start_addr:'number', end_addr:'number', name:'string', read:'bool', write:'bool', execute:'bool', shared:'bool', valid:'bool' } },
		'dfhack.internal.memscan': { _type:'tuple', _tuple:['number','number'] },
		'dfhack.internal.getPE': 'number',
		'dfhack.internal.getMD5': 'string',
		'dfhack.internal.getVTable': 'number',
		'dfhack.internal.diffscan': 'number',
		'dfhack.internal.getModifiers': { _type:'table', shift:'bool', ctrl:'bool', alt:'bool' },
		'dfhack.internal.getModstate': 'number',
		'dfhack.internal.getImageBase': 'number',
		'dfhack.internal.getRebaseDelta': 'number',
		'dfhack.internal.adjustOffset': 'number',
		'dfhack.internal.patchBytes': { _type:'tuple', _tuple:['bool','string'] },
		'dfhack.TranslateName': 'string',
		'dfhack.buildings.deconstruct': 'none',
		'dfhack.buildings.markedForRemoval': 'bool',
		'dfhack.buildings.getRoomDescription': 'string',
		'dfhack.buildings.setOwner': 'none',
		'dfhack.buildings.findAtTile': 'df.building',
		'dfhack.buildings.getStockpileContents': { _type:'df.item[]', _array:'df.item' },
		'dfhack.gui.getSelectedUnit': 'df.unit',
		'dfhack.gui.getSelectedBuilding': 'df.building',
		'dfhack.gui.getDwarfmodeViewDims': { _type:'table', map_x1:'number', map_x2:'number', menu_x1:'number', menu_x2:'number', area_x1:'number', area_x2:'number', y1:'number', y2:'number', map_y1:'number', map_y2:'number', menu_on:'bool', area_on:'bool', menu_forced:'bool' },
		'dfhack.screen.inGraphicsMode': 'bool',
		'dfhack.screen.getKeyDisplay': 'string',
		'dfhack.screen.show': 'none',
		'dfhack.screen.isDismissed': 'bool',
		'dfhack.screen.getWindowSize': { _type:'tuple', _tuple:['number','number'] },
		'dfhack.screen.dismiss': 'none',
		'dfhack.screen._doSimulateInput': 'none',
		'dfhack.screen.clear': 'none',
		'dfhack.screen.fillRect': 'none',
		'dfhack.screen.paintString': 'none',
		'dfhack.screen.paintTile': 'none',
		'dfhack.screen.getMousePos': { _type:'tuple', _tuple:['number','number'] },
		'dfhack.screen.readTile': 'dfhack.pen',
		'dfhack.run_command_silent': { _type:'tuple', _tuple:['string', 'number'] },
		'dfhack.kitchen.addExclusion': 'bool',
		'dfhack.kitchen.findExclusion': 'number',
		'dfhack.kitchen.removeExclusion': 'bool',
		'dfhack.world.isFortressMode': 'bool',
		'dfhack.world.isAdventureMode': 'bool',
		'dfhack.world.isArena': 'bool',
		'dfhack.world.isLegends': 'bool',
		'dfhack.world.SetCurrentWeather': 'none',
		'dfhack.world.ReadCurrentWeather': 'df.weather_type',
		'dfhack.world.ReadCurrentDay': 'number',
		'dfhack.world.ReadCurrentMonth': 'number',
		'dfhack.filesystem.exists': 'bool',
		'dfhack.filesystem.isfile': 'bool',
		'dfhack.filesystem.isdir': 'bool',
		'dfhack.filesystem.mkdir': 'bool',
		'dfhack.filesystem.atime': 'number',
		'dfhack.filesystem.mtime': 'number',
		'dfhack.filesystem.ctime': 'number',
		'dfhack.filesystem.listdir': { _type: 'table', _array: { _type: 'table', path: 'string', isdir: 'bool' } },
		'dfhack.filesystem.listdir_recursive': { _type: 'table', _array: { _type: 'table', path: 'string', isdir: 'bool' } },
		'dfhack.pen.parse': 'dfhack.pen',
		'dfhack.persistent.save': { _type: 'tuple', _tuple: [{
			_type: 'table',

			entry_id: 'number',
			key: 'string',
			value: 'string',
			ints: { _type: 'number[]', _array: 'number' }
		}, 'bool'] },

		'df.isnull': 'bool',
		'df.isvalid': 'string',

		'string.utf8capitalize': 'string',

		'native.verify_pwd': 'bool',
		'native.check_wtoken': 'bool',
		'native.update_wtoken': 'number',
		'native.set_timer': 'none',
		'native.itemcache_init': 'none',
		'native.itemcache_free': 'none',
		'native.itemcache_get': 'native.itemcache',
		'native.itemcache_get_category': 'native.type_category',
		'native.itemcache_search': 'native.group_info[]',
		'native.custom_command': 'string',

		'mp.pack': 'string',

		'printall': 'none',
		'setmetatable': 'none',

		'deflatelua.inflate_zlib': 'none',

		'io.read': 'string',
		'io.write': 'none',
		'io.flush': 'none',
		'io.close': 'none',

		'coroutine.running': 'coroutine',
		'coroutine.status': 'string',
		'coroutine.yield': { _type:'tuple', _tuple:[] },

		'__dumper.DataDumper': 'string',
	},

	modules: {
		'plugins.eventful': {
			types: {
				onWorkshopFillSidebarMenu: { _type:'__EventHolder', _inp:'df.building_actual,bool' },
				postWorkshopFillSidebarMenu: { _type:'__EventHolder', _inp:'df.building_actual' },
				onReactionCompleting: { _type:'__EventHolder', _inp:'df.reaction,df.reaction_product_itemst,df.unit,df.item[],df.reaction_reagent[],df.item[],bool' },
				onReactionComplete: { _type:'__EventHolder', _inp:'df.reaction,df.reaction_product_itemst,df.unit,df.item[],df.reaction_reagent[],df.item[]' },
				onItemContaminateWound: { _type:'__EventHolder', _inp:'df.item_actual,df.unit,df.unit_wound,number,number' },
				onProjItemCheckImpact: { _type:'__EventHolder', _inp:'df.proj_itemst,bool' },
				onProjItemCheckMovement: { _type:'__EventHolder', _inp:'df.proj_itemst' },
				onProjUnitCheckImpact: { _type:'__EventHolder', _inp:'df.projunitst_,bool' },
				onProjUnitCheckMovement: { _type:'__EventHolder', _inp:'df.proj_unitst' },
				onBuildingCreatedDestroyed: { _type:'__EventHolder', _inp:'number' },
				onJobInitiated: { _type:'__EventHolder', _inp:'df.job' },
				onJobCompleted: { _type:'__EventHolder', _inp:'df.job' },
				onUnitDeath: { _type:'__EventHolder', _inp:'number' },
				onItemCreated: { _type:'__EventHolder', _inp:'number' },
				onConstructionCreatedDestroyed: { _type:'__EventHolder', _inp:'df.construction' },
				onSyndrome: { _type:'__EventHolder', _inp:'number,number' },
				onInvasion: { _type:'__EventHolder', _inp:'number' },
				onInventoryChange: { _type:'__EventHolder', _inp:'number,number,df.unit_inventory_item,df.unit_inventory_item' },
				onReport: { _type:'__EventHolder', _inp:'number' },
				onUnitAttack: { _type:'__EventHolder', _inp:'number,number,number' },
				onUnload: { _type:'__EventHolder', _inp:'none' },
				onInteraction: { _type:'__EventHolder', _inp:'string,string,number,number,number,number' },
			},

			functions: {
				'enableEvent': 'none',
			},
		},
		'plugins.rendermax': {
			functions: {
				'isEnabled': 'bool',
				'lockGrids': 'none',
				'unlockGrids': 'none',
				'resetGrids': 'none',
				'getCell': {
					_type: 'table',
					fm: { _type:'table', r:'number', g:'number', b:'number' },
					fo: { _type:'table', r:'number', g:'number', b:'number' },
					bm: { _type:'table', r:'number', g:'number', b:'number' },
					bo: { _type:'table', r:'number', g:'number', b:'number' },
				},
				'setCell': 'none',
				'getGridsSize': { _type:'tuple', _tuple:['number','number'] },
				'invalidate': 'none',
			},
		},
	},

	parent: null,
};
