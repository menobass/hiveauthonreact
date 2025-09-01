import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
  AppState,
  AppStateStatus,
  Share,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { hiveAuthService, HiveAuthLoginRequest, HiveAuthCallbackData } from '../lib/hiveauth-service';

// Default demo user - can be changed by user input
const DEFAULT_USER = 'demo-user';

export default function HiveAuthDemo() {
  const [isLoading, setIsLoading] = useState(false);
  const [inputUsername, setInputUsername] = useState(DEFAULT_USER);
  const [server, setServer] = useState<'arcange' | 'official'>('arcange');
  const [authRequest, setAuthRequest] = useState<HiveAuthLoginRequest | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Ready to login with HiveAuth');
  const [deepLinkUrl, setDeepLinkUrl] = useState<string | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
  // Set initial server
  hiveAuthService.setServer(server === 'arcange' ? 'wss://hive-auth.arcange.eu/' : 'wss://has.hiveauth.com/');
    // Check if user is already authenticated
    checkAuthStatus();
    // Try resuming a pending auth on mount (helpful after coming back from Keychain)
    hiveAuthService.resumePendingAuth((evt) => {
      const { uuid, expire, key, host } = evt as any;
      if (!uuid || !key) return;
      const username = inputUsername.trim() || DEFAULT_USER;
      setAuthRequest({ uuid, user: username, key });
      const link = hiveAuthService.buildKeychainDeepLink(uuid, username, key, host);
      setDeepLinkUrl(link);
      setStatus('🔄 Reattached: waiting for Keychain approval...');
    });
    
    // Set up deep link listener
    const subscription = Linking.addEventListener('url', handleDeepLink);
    // AppState listener to re-attach after returning to foreground
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
      appStateSub?.remove();
    };
  }, []);

  useEffect(() => {
    hiveAuthService.setServer(server === 'arcange' ? 'wss://hive-auth.arcange.eu/' : 'wss://has.hiveauth.com/');
  }, [server]);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // Attempt to resume a pending authentication when app returns to foreground
      await hiveAuthService.resumePendingAuth((evt) => {
        const { uuid, expire, key, host } = evt as any;
        if (!uuid || !key) return;
        const username = inputUsername.trim() || DEFAULT_USER;
        setAuthRequest({ uuid, user: username, key });
        const link = hiveAuthService.buildKeychainDeepLink(uuid, username, key, host);
        setDeepLinkUrl(link);
        setStatus('🔄 Reattached: waiting for Keychain approval...');
      });
    }
    appState.current = nextAppState;
  };

  /**
   * Check if user is already authenticated
   */
  const checkAuthStatus = async () => {
    try {
      const stored = await hiveAuthService.getStoredToken();
      if (stored) {
        setAuthToken(stored.token);
        setLoggedInUser(stored.username);
        setStatus(`✅ Already logged in as ${stored.username}`);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

  /**
   * Handle incoming deep links
   */
  const handleDeepLink = (event: { url: string }) => {
    console.log('Received deep link:', event.url);
    
    // Check if this is a HiveAuth callback
    if (event.url.includes('hiveauth/callback')) {
      const callbackData = hiveAuthService.parseCallbackUrl(event.url);
      if (callbackData) {
        handleAuthCallback(callbackData);
      } else {
        setStatus('❌ Invalid callback URL format');
      }
    }
  };

  /**
   * Handle authentication callback from Hive Keychain
   */
  const handleAuthCallback = async (callbackData: HiveAuthCallbackData) => {
    console.log('Processing auth callback:', callbackData);
    
    if (callbackData.status === 'ok' && callbackData.token) {
      try {
        // Store the token
        await hiveAuthService.storeToken(callbackData.token, inputUsername.trim());
        
        setAuthToken(callbackData.token);
        setLoggedInUser(inputUsername.trim());
        setStatus(`✅ Logged in as ${inputUsername.trim()} with token: ${callbackData.token.substring(0, 20)}...`);
        setAuthRequest(null);
      } catch (error) {
        console.error('Error storing token:', error);
        setStatus('❌ Error storing authentication token');
      }
    } else {
      setStatus(`❌ Login failed: ${callbackData.error || 'Unknown error'}`);
      setAuthRequest(null);
    }
    
    setIsLoading(false);
  };

  /**
   * Initiate HiveAuth login flow
   */
  const handleHiveAuthLogin = async () => {
    if (isLoading) return;
    // If a stale pending exists, allow immediate retry by cancelling it
    if ((hiveAuthService as any).isPending?.()) {
      await hiveAuthService.cancelPending();
    }
    
    // Validate username
    if (!inputUsername.trim()) {
      Alert.alert('Error', 'Please enter a Hive username');
      return;
    }
    
    setIsLoading(true);
    setStatus('Connecting to HiveAuth...');

    try {
      // Start authenticate via WebSocket; open Keychain on auth_wait
      const username = inputUsername.trim();
      let opened = false;
  const result = await hiveAuthService.authenticate(username, (evt) => {
        const { uuid, expire, key, host } = evt as any;
        const req: HiveAuthLoginRequest = { uuid, user: username, key };
        setAuthRequest(req);
        const link = hiveAuthService.buildKeychainDeepLink(uuid, username, key, host);
        setDeepLinkUrl(link);
        setStatus('✅ Deep link ready. Tap "Open in Keychain" below, approve there, then return here.');
      });

      // Approved
      if (result.token) {
        await hiveAuthService.storeToken(result.token, username);
        setAuthToken(result.token);
        setLoggedInUser(username);
        setStatus(`✅ Logged in as ${username}`);
        setAuthRequest(null);
      } else {
        setStatus('✅ Authentication approved');
      }

    } catch (error) {
      console.error('Error creating HiveAuth request:', error);
      setStatus('❌ Authentication failed');
      setIsLoading(false);
    }
  };

  /**
   * Open Hive Keychain Mobile (or show URL for testing)
   */
  const openKeychain = async (url: string) => {
    try {
      setStatus('Opening Hive Keychain Mobile...');
      
      // On web or if Keychain is not installed, show the URL
      if (Platform.OS === 'web' || !(await Linking.canOpenURL(url))) {
        Alert.alert(
          'HiveAuth Deep Link Generated',
          `📱 Deep Link: ${url.substring(0, 50)}...\n\n✅ On mobile with Hive Keychain installed, this would launch the app for authentication.\n\n🔧 For demo purposes, use the simulation buttons below to test the authentication flow.`,
          [{ text: 'Got it!' }]
        );
  setStatus('✅ Deep link generated. Tap it to open Keychain on a device.');
      } else {
        // Open Keychain on mobile
        await Linking.openURL(url);
  setStatus('🔄 Opened in Keychain. Approve there, then return here.');
      }
    } catch (error) {
      console.error('Error opening Keychain:', error);
      setStatus('❌ Error opening Hive Keychain');
      setIsLoading(false);
    }
  };

  /**
   * Simulate successful authentication (for testing)
   */
  const simulateSuccess = () => {
    if (!authRequest) return;
    
    const mockToken = `mock_token_${Date.now()}`;
    const callbackUrl = `myapp://hiveauth/callback?uuid=${authRequest.uuid}&status=ok&token=${mockToken}`;
    
    // Simulate callback
    handleDeepLink({ url: callbackUrl });
  };

  /**
   * Simulate failed authentication (for testing)
   */
  const simulateError = () => {
    if (!authRequest) return;
    
    const callbackUrl = `myapp://hiveauth/callback?uuid=${authRequest.uuid}&status=error&error=User cancelled`;
    
    // Simulate callback
    handleDeepLink({ url: callbackUrl });
  };

  /**
   * Logout user
   */
  const handleLogout = async () => {
    try {
      await hiveAuthService.cancelPending();
      await hiveAuthService.clearStoredAuth();
      setAuthToken(null);
      setLoggedInUser(null);
      setAuthRequest(null);
      setDeepLinkUrl(null);
      setStatus('Logged out successfully');
    } catch (error) {
      console.error('Error during logout:', error);
      setStatus('❌ Error during logout');
    }
  };

  const cancelPending = async () => {
    await hiveAuthService.cancelPending();
    setAuthRequest(null);
    setDeepLinkUrl(null);
    setIsLoading(false);
    setStatus('Pending authentication cancelled');
  };

  const postCustomJson = async () => {
    try {
      setStatus('Preparing custom_json...');
      const resPromise = hiveAuthService.signCustomJson(
        'I posted this with a react native app and hiveauth',
        'react_native_demo',
        true,
        (evt) => {
          setStatus('🔄 Custom JSON awaiting approval in Keychain...');
          // Optionally open Keychain if user prefers automatic handoff
          if (deepLinkUrl) openKeychain(deepLinkUrl);
        }
      );
      const res = await resPromise;
      if (res.status === 'approved') {
        setStatus('✅ Custom JSON broadcast approved');
      }
    } catch (e: any) {
      setStatus(`❌ Custom JSON failed: ${e?.message || e}`);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>HiveAuth Demo</Text>
        <Text style={styles.subtitle}>React Native + Expo + HiveAuth</Text>
        {/* Server selector */}
        <View style={styles.selectorRow}>
          <Text style={styles.selectorLabel}>Server:</Text>
          <TouchableOpacity
            style={[styles.selectorBtn, server === 'arcange' && styles.selectorBtnActive]}
            onPress={() => setServer('arcange')}
          >
            <Text style={styles.selectorText}>arcange.eu</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selectorBtn, server === 'official' && styles.selectorBtnActive]}
            onPress={() => setServer('official')}
          >
            <Text style={styles.selectorText}>hiveauth.com</Text>
          </TouchableOpacity>
        </View>

        {/* Username Input */}
        {!authToken && (
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Hive Username:</Text>
            <TextInput
              style={styles.textInput}
              value={inputUsername}
              onChangeText={setInputUsername}
              placeholder="Enter your Hive username"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>
        )}

        {/* Status Display */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        {/* Auth Request Details */}
        {authRequest && (
          <View style={styles.detailsContainer}>
            <Text style={styles.detailsTitle}>Request Details:</Text>
            <Text style={styles.detailItem}>UUID: {authRequest.uuid}</Text>
            <Text style={styles.detailItem}>User: {authRequest.user}</Text>
            <Text style={styles.detailItem}>Key: {authRequest.key.substring(0, 20)}...</Text>
          </View>
        )}

        {/* Deep Link URL */}
        {deepLinkUrl && (
          <View style={styles.detailsContainer}>
            <Text style={styles.detailsTitle}>Keychain Deep Link:</Text>
            <Text style={styles.deepLinkText}>{deepLinkUrl}</Text>
            <View style={styles.inlineButtons}>
              <TouchableOpacity style={[styles.smallBtn, styles.primaryButton]} onPress={() => openKeychain(deepLinkUrl)}>
                <Text style={styles.smallBtnText}>Open in Keychain</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn]} onPress={() => Share.share({ message: deepLinkUrl })}>
                <Text style={styles.smallBtnText}>Share Link</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Main Action Buttons */}
        <View style={styles.buttonContainer}>
          {!authToken ? (
            <>
              <TouchableOpacity 
                style={[styles.button, styles.primaryButton]} 
                onPress={handleHiveAuthLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.buttonText}>Login with HiveAuth</Text>
                )}
              </TouchableOpacity>

              {/* Testing Buttons (shown when waiting for callback) */}
              {authRequest && (
                <View style={styles.testingContainer}>
                  <Text style={styles.testingTitle}>Testing Simulation:</Text>
                  <TouchableOpacity 
                    style={[styles.button, styles.successButton]} 
                    onPress={simulateSuccess}
                  >
                    <Text style={styles.buttonText}>Simulate Success</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.button, styles.errorButton]} 
                    onPress={simulateError}
                  >
                    <Text style={styles.buttonText}>Simulate Error</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.button, styles.logoutButton]} 
                    onPress={cancelPending}
                  >
                    <Text style={styles.buttonText}>Cancel Pending</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={styles.authSuccessContainer}>
                <Text style={styles.authSuccessText}>✅ Authenticated</Text>
                <Text style={styles.authUserText}>User: {loggedInUser}</Text>
                <Text style={styles.authTokenText}>Token: {authToken.substring(0, 30)}...</Text>
              </View>

              <TouchableOpacity 
                style={[styles.button, styles.successButton]} 
                onPress={postCustomJson}
              >
                <Text style={styles.buttonText}>Post custom_json</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.button, styles.logoutButton]} 
                onPress={handleLogout}
              >
                <Text style={styles.buttonText}>Logout</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Information Section */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>HiveAuth Flow:</Text>
          <Text style={styles.infoItem}>1. Create login request with UUID</Text>
          <Text style={styles.infoItem}>2. Send to HiveAuth server</Text>
          <Text style={styles.infoItem}>3. Open Keychain with deep link</Text>
          <Text style={styles.infoItem}>4. Receive callback with token</Text>
          <Text style={styles.infoItem}>5. Store token in AsyncStorage</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    padding: 20,
    minHeight: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  statusContainer: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  statusText: {
    fontSize: 14,
    color: '#555',
  },
  detailsContainer: {
    backgroundColor: '#e3f2fd',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1976d2',
  },
  detailItem: {
    fontSize: 13,
    color: '#333',
    marginBottom: 5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  deepLinkText: {
    fontSize: 12,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 4,
  },
  inlineButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f7f7f7',
  },
  smallBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonContainer: {
    marginBottom: 20,
  },
  button: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#1976d2',
  },
  successButton: {
    backgroundColor: '#4caf50',
  },
  errorButton: {
    backgroundColor: '#f44336',
  },
  logoutButton: {
    backgroundColor: '#ff5722',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  testingContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#fff3e0',
    borderRadius: 8,
  },
  testingTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#f57c00',
  },
  authSuccessContainer: {
    backgroundColor: '#e8f5e8',
    padding: 20,
    borderRadius: 8,
    marginBottom: 15,
    alignItems: 'center',
  },
  authSuccessText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 10,
  },
  authUserText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
  },
  authTokenText: {
    fontSize: 12,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  infoContainer: {
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  infoItem: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  selectorLabel: {
    fontSize: 14,
    color: '#333',
    marginRight: 8,
  },
  selectorBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    marginHorizontal: 4,
    backgroundColor: '#f7f7f7',
  },
  selectorBtnActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1976d2',
  },
  selectorText: {
    color: '#000',
  },
});
