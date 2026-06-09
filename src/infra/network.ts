// src/infra/network.ts — typed wrapper over `expo-network`.
//
// Single function: `getNetworkSnapshot()`. Used by the sync trigger
// (WU-4) to decide whether to start the worker on app foreground and
// on Wi-Fi events. The full event-subscription API lives in
// `src/services/network-observer.ts` (WU-4).

import * as Network from 'expo-network';

export type NetworkType = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

export type NetworkSnapshot = {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: NetworkType;
};

export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  const state = await Network.getNetworkStateAsync();
  return {
    isConnected: state.isConnected === true,
    isInternetReachable: state.isInternetReachable === true,
    type: mapType(state.type),
  };
}

function mapType(input: Network.NetworkStateType | undefined): NetworkType {
  if (!input) return 'unknown';
  if (input === Network.NetworkStateType.WIFI) return 'wifi';
  if (input === Network.NetworkStateType.CELLULAR) return 'cellular';
  if (input === Network.NetworkStateType.ETHERNET) return 'ethernet';
  if (input === Network.NetworkStateType.NONE) return 'none';
  return 'unknown';
}
