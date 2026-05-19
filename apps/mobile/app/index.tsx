import { View, ActivityIndicator } from 'react-native'

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1035' }}>
      <ActivityIndicator size="large" color="#c026d3" />
    </View>
  )
}
