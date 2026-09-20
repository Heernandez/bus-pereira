export type MapSelection =
  | { type: 'none' }
  | { type: 'station'; stationId: string }
  | { type: 'route'; routeId: string; variantId?: string; tripId?: string }
  | { type: 'bus'; busId: string; routeId: string; variantId: string; tripId?: string };
export type MapState = { selection: MapSelection; sheet: 'expanded' | 'collapsed'; history: MapSelection[] };
export const initialMapState: MapState = { selection: { type: 'none' }, sheet: 'expanded', history: [] };
export type MapAction = { type: 'select'; selection: MapSelection } | { type: 'back' } | { type: 'clear' } | { type: 'sheet'; value: MapState['sheet'] };
export function mapSelectionReducer(state: MapState, action: MapAction): MapState {
  switch (action.type) {
    case 'select': return {
      selection: action.selection, sheet: 'expanded',
      history: JSON.stringify(state.selection) === JSON.stringify(action.selection) ? state.history : [...state.history, state.selection].slice(-10),
    };
    case 'sheet': return { ...state, sheet: action.value };
    case 'clear': return initialMapState;
    case 'back': return { selection: state.history.at(-1) ?? { type: 'none' }, sheet: 'expanded', history: state.history.slice(0, -1) };
  }
}
