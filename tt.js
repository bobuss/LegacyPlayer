

const workletProcessorCodes = {
    'ft2': ["lib/utils.js", "lib/ft2.js", "audioworklets/ft2_worklet_processor.js"],
    'st3': ["lib/utils.js", "lib/st3.js", "audioworklets/st3_worklet_processor.js"],
    'pt': ["lib/pt.js", "audioworklets/pt_worklet_processor.js"],
    'ahx': ["lib/ahx.js", "audioworklets/ahx_worklet_processor.js"],
    'openmpt': ["lib/libopenmpt.js", "audioworklets/openmpt_worklet_processor.js"],
    'sc68': ["lib/sc68.js", "lib/base_backend_adapter.js", "lib/sc68_backend_adapter.js", "audioworklets/sc68_worklet_processor.js"],
    'sid': ["lib/sid.js", "lib/base_backend_adapter.js", "lib/sid_backend_adapter.js", "audioworklets/sid_worklet_processor.js"],
};


Object.keys(workletProcessorCodes).forEach( format => {
    workletProcessorCodes[format] = workletProcessorCodes[format].map(item => item + 'wwwww')
});

console.log(workletProcessorCodes)

