// Bridge for classic-script modules. ESM page entries install services here;
// legacy scripts can consume them without import syntax or load-order changes.
const runtimeServices = globalThis.__MediaForgeRuntimeServices || (globalThis.__MediaForgeRuntimeServices = {});
export function registerRuntimeServices(services) { Object.assign(runtimeServices, services); }
export function getRuntimeServices() { return runtimeServices; }
