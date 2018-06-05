module.exports = {
	_type: '__context',

	guesses: {
	},

	types: {
		null: 'null',

		df: {
			_type: '__df',
			global: {
				_type: '__global',
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
			_type: 'io'
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

			persistent: {
				_type: 'dfhack.persistent',
				__tostring: {
					_type: 'function',
					_anyfunc: true
				}
			},

			safecall: { _type:'function', _node:'pcall' },
			curry: { _type:'function' }, // TODO
			exception: { _type:'function' }, // TODO
			penarray: { _type:'function' }, // TODO

			pen: {
				_type: 'dfhack.pen',
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
				},
			},

			filesystem: {
				_type: 'dfhack.filesystem',
				_alias: true,
			},

			screen: {
				_type: 'dfhack.screen',
				_alias: true,
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
			_tuple: ['string', '__unknown']
		},

		'math.abs': 'number',
		'math.floor': 'number',
		'math.ceil': 'number',
		'math.min': 'number',
		'math.max': 'number',
		'math.random': 'number',

		'table.insert': 'none',
		'table.remove': 'none',
		'table.sort': 'none',
		'table.concat': 'string',
		'table.pack': 'table',
		'table.unpack': { _type:'tuple', _tuple:[] },
		
		'string.gsub': 'string',
		'string.sub': 'string',
		'string.byte': 'number',
		'string.char': 'string',
		'string.find': 'number',
		'string.upper': 'string',
		'string.lower': 'string',
		'string.match': 'string',
		'string.format': 'string',

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
		'dfhack.getDFPath': 'string',
		'dfhack.getHackPath': 'string',
		'dfhack.df2utf': 'string',
		'dfhack.df2console': 'string',
		'dfhack.isMapLoaded': 'bool',
		'dfhack.isWorldLoaded': 'bool',
		'dfhack.timeout': 'number',
		'dfhack.timeout_active': 'function',
		'dfhack.gui.getCurViewscreen': 'df.viewscreen',
		'dfhack.gui.getSelectedItem': 'df.item',
		'dfhack.gui.showAnnouncement': 'none',
		'dfhack.gui.getFocusString': 'string',
		'dfhack.random': 'number',
		'__dfhack_random.init': 'none',
		'__dfhack_random.random': 'number',
		'__dfhack_random.drandom': 'number',
		'dfhack.units.getProfessionName': 'string',
		'dfhack.units.isCitizen': 'bool',
		'dfhack.units.isOwnCiv': 'bool',
		'dfhack.units.getVisibleName': 'df.language_name',
		'dfhack.units.getProfessionColor': 'number',
		'dfhack.units.getNemesis': 'df.nemesis_record',
		'dfhack.units.getPosition': { _type:'tuple', _tuple:['number', 'number', 'number'] },
		'dfhack.units.getCasteProfessionName': 'string',
		'dfhack.units.setNickname': 'none',
		'dfhack.units.isOwnGroup': 'bool',
		'dfhack.units.isSane': 'bool',
		'dfhack.units.isDead': 'bool',
		'dfhack.units.isOpposedToLife': 'bool',
		'dfhack.units.getNoblePositions': { _type: 'Units::NoblePosition[]', _array: 'Units::NoblePosition' },
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
		'dfhack.maps.getTileType': 'df.tiletype',
		'dfhack.maps.getTileFlags': { _type:'tuple', _tuple:['df.tile_designation', 'df.tile_occupancy'] },
		'dfhack.maps.spawnFlow': 'df.flow_info',
		'dfhack.burrows.setAssignedUnit': 'none',
		'dfhack.internal.memmove': 'none',
		'dfhack.internal.findScript': 'string',
		'dfhack.internal.getRebaseDelta': 'number',
		'dfhack.internal.setAddress': 'none',
		'dfhack.internal.getAddress': 'number',
		'dfhack.internal.getDir': { _type:'string[]', _array:'string' },
		'dfhack.internal.runCommand': { _type:'table', _array:{ _type:'table', '1':'number', '2':'string' }, status:'number' },
		'dfhack.TranslateName': 'string',
		'dfhack.buildings.deconstruct': 'none',
		'dfhack.buildings.markedForRemoval': 'bool',
		'dfhack.buildings.getRoomDescription': 'string',
		'dfhack.buildings.setOwner': 'none',
		'dfhack.buildings.findAtTile': 'df.building',
		'dfhack.buildings.getStockpileContents': { _type:'df.item[]', _array:'df.item' },
		'dfhack.gui.getSelectedUnit': 'df.unit',
		'dfhack.gui.getSelectedBuilding': 'df.building',
		'dfhack.screen.inGraphicsMode': 'bool',
		'dfhack.screen.getKeyDisplay': 'string',
		'dfhack.screen.show': 'none',
		'dfhack.screen.isDismissed': 'bool',
		'dfhack.run_command_silent': { _type:'tuple', _tuple:['string', 'number'] },
		'dfhack.kitchen.addExclusion': 'bool',
		'dfhack.kitchen.findExclusion': 'number',
		'dfhack.kitchen.removeExclusion': 'bool',
		'dfhack.world.isFortressMode': 'bool',
		'dfhack.world.isAdventureMode': 'bool',
		'dfhack.world.isArena': 'bool',
		'dfhack.world.isLegends': 'bool',
		'dfhack.world.SetCurrentWeather': 'none',
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
	},

	parent: null,
};
