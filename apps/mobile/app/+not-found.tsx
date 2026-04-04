import { Link, Stack } from "expo-router";
import { View, Text } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Page not found" }} />
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Page not found</Text>
        <Link href="/">Back to home</Link>
      </View>
    </>
  );
}
