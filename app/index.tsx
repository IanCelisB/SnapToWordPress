// Index screen placeholder for WU-1. Replaced in WU-2 (first-launch
// routing) and WU-3 (the capture tab).

import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#FAFAF7',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Text style={{ color: '#1F1F1F', fontSize: 18 }}>
        Etiquetador de Productos
      </Text>
      <Text style={{ color: '#6B6B6B', fontSize: 14, marginTop: 8 }}>
        WU-1: foundation
      </Text>
    </View>
  );
}
