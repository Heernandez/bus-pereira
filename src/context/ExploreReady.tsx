import { createContext, useContext } from 'react';

export const ExploreReadyContext = createContext({
  markNativeReady: () => {},
  markExploreReady: () => {},
});
export const useExploreReady = () => useContext(ExploreReadyContext);
