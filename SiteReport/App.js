import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';

// Screens
import NewReportScreen from './screens/NewReportScreen';
import AddItemScreen from './screens/AddItemScreen';
import PreviewReportScreen from './screens/PreviewReportScreen';
import ReportActionsScreen from './screens/ReportActionsScreen';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#0A79DF',
    accent: '#FFC312',
  },
};

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName="ReportActions"
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.colors.primary,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
          <Stack.Screen 
            name="ReportActions" 
            component={ReportActionsScreen} 
            options={{ title: "Report Actions" }} 
          />
          <Stack.Screen 
            name="NewReport" 
            component={NewReportScreen} 
            options={{ title: "New Report" }} 
          />
          <Stack.Screen 
            name="AddItem" 
            component={AddItemScreen} 
            options={{ title: "Add Voice Note" }} 
          />
          <Stack.Screen 
            name="PreviewReport" 
            component={PreviewReportScreen} 
            options={{ title: "Preview Report" }} 
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
