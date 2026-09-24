const initialState = () => ({
  canvas: null,
  nodes: [],
  selectedId: '',
  selectedIds: [],
  selectedImage: { nodeId: '', index: -1 },
  viewport: { x: 0, y: 0, scale: 1 },
});
const state = initialState();

export function getCanvasState() {
  return state;
}

export function replaceCanvasState(nextState = {}) {
  Object.assign(state, nextState);
  return state;
}

export function resetCanvasState() {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, initialState());
  return state;
}

export function selectCanvasNode(id = '', ids = []) {
  state.selectedId = String(id || '');
  state.selectedIds = Array.isArray(ids) ? ids.map(value => String(value)) : [];
  return state;
}

export function updateCanvasViewport(nextViewport = {}) {
  state.viewport = { ...state.viewport, ...nextViewport };
  return state.viewport;
}

export function setCanvasSelection({ id = '', ids = [], image = null } = {}) {
  state.selectedId = String(id || '');
  state.selectedIds = Array.isArray(ids) ? ids.map(value => String(value)) : [];
  if (image) state.selectedImage = { ...state.selectedImage, ...image };
  return state;
}
