module.exports = {
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
		
		/*string: {
			_type: 'string',
			upper: { _type:'function', _node:'string' },
		},*/
		
		dfhack: {
			type: '__dfhack',
			DF_VERSION: 'string',
			
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
					'getCraftClass': 'df.craft_material_class',
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
		tostring: 'string',
		tonumber: 'number',
		print: 'none',
		type: 'string',
		
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
		'string.lower': 'string',
		
		'bit32.band': 'number',
		'bit32.lshift': 'number',
		'bit32.rshift': 'number',
		'bit32.bnot': 'number',
		
		'dfhack.getOSType': 'string',
		'dfhack.df2utf': 'string',
		'dfhack.isMapLoaded': 'bool',
		'dfhack.timeout': 'none',
		'dfhack.gui.getCurViewscreen': 'df.viewscreen',
		'dfhack.units.getProfessionName': 'string',
		'dfhack.units.isCitizen': 'bool',
		'dfhack.units.isOwnCiv': 'bool',
		'dfhack.units.getVisibleName': 'df.language_name',
		'dfhack.units.getProfessionColor': 'number',
		'dfhack.units.getNemesis': 'df.nemesis_record',
		'dfhack.units.getPosition': { _type:'tuple', _tuple:['number', 'number', 'number'] },
		'dfhack.units.getCasteProfessionName': 'string',
		'dfhack.units.setNickname': 'none',
		'dfhack.items.getGeneralRef': 'df.general_ref',
		'dfhack.items.getDescription': 'string',
		'dfhack.items.getItemBaseValue': 'number',
		'dfhack.items.getValue': 'number',
		'dfhack.items.getContainedItems': { _type:'df.item[]', _array:'df.item' },
		'dfhack.items.getPosition': { _type:'tuple', _tuple:['number', 'number', 'number'] },
		'dfhack.items.getContainer': 'df.item',
		'dfhack.items.getHolderUnit': 'df.unit',
		'dfhack.matinfo.decode': 'dfhack.matinfo',
		'dfhack.matinfo.find': 'dfhack.matinfo',
		'dfhack.matinfo.matches': 'bool',
		'dfhack.job.getName': 'string',
		'dfhack.job.getWorker': 'df.unit',
		'dfhack.job.getGeneralRef': 'df.general_ref',
		'dfhack.job.removeWorker': 'none',
		'dfhack.maps.getRegionBiome': 'df.region_map_entry',
		'dfhack.maps.getBlock': 'df.map_block',
		'dfhack.maps.getTileBlock': 'df.map_block',
		'dfhack.maps.getTileType': 'df.tiletype',
		'dfhack.burrows.setAssignedUnit': 'none',
		'dfhack.internal.memmove': 'none',
		'dfhack.internal.getRebaseDelta': 'number',
		'dfhack.internal.setAddress': 'none',
		'dfhack.internal.getAddress': 'number',
		'dfhack.TranslateName': 'string',
		'dfhack.buildings.deconstruct': 'none',
		'dfhack.buildings.setOwner': 'none',
		'dfhack.buildings.findAtTile': 'df.building',
		'dfhack.buildings.getStockpileContents': { _type:'df.item[]', _array:'df.item' },
		'dfhack.gui.getSelectedUnit': 'df.unit',
		'dfhack.gui.getSelectedBuilding': 'df.building',
		'dfhack.screen.getKeyDisplay': 'string',
		'dfhack.run_command_silent': { _type:'tuple', _tuple:['string', 'number'] },
		
		'utils.call_with_string': 'string',
		'utils.insert_sorted': 'none',
		'utils.erase_sorted': 'none',
		'utils.erase_sorted_key': 'none',
		'utils.insert_or_update': 'none',
		
		'gui.simulateInput': 'none',
		
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
		
		'mp.pack': 'string',
		
		'mkmodule': 'none',
		'printall': 'none',
		
		'deflatelua.inflate_zlib': 'none',
		
	},

	parent: null,
};