import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import HiveAuthDemo from './hiveauth-demo';

// Simple navigation component
export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'menu' | 'hiveauth'>('menu');

  if (currentScreen === 'hiveauth') {
    return <HiveAuthDemo />;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      <View style={styles.menuContainer}>
        <Text style={styles.title}>Hive Auth Tests</Text>
        <Text style={styles.subtitle}>Choose a demo to run</Text>

        <TouchableOpacity 
          style={[styles.button, styles.primaryButton]} 
          onPress={() => setCurrentScreen('hiveauth')}
        >
          <Text style={styles.buttonText}>HiveAuth Login Demo</Text>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>HiveAuth Demo Features:</Text>
          <Text style={styles.infoItem}>• UUID-based login requests</Text>
          <Text style={styles.infoItem}>• HiveAuth server integration</Text>
          <Text style={styles.infoItem}>• Deep link handling</Text>
          <Text style={styles.infoItem}>• Keychain Mobile integration</Text>
          <Text style={styles.infoItem}>• AsyncStorage token persistence</Text>
          <Text style={styles.infoItem}>• Testing simulation buttons</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  menuContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  button: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#1976d2',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoContainer: {
    backgroundColor: '#f9f9f9',
    padding: 20,
    borderRadius: 12,
    marginTop: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  infoItem: {
    fontSize: 16,
    color: '#555',
    marginBottom: 8,
  },
});
