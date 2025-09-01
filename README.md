# Hive Auth Tests

A React Native + Expo application demonstrating HiveAuth login flow with deep linking, featuring secure authentication and token persistence.

## 🎯 HiveAuth Demo Features

- ✅ **UUID-based login requests** - Generate unique authentication requests
- ✅ **HiveAuth server integration** - Connect to HiveAuth API endpoints
- ✅ **Deep link handling** - Process callbacks from Hive Keychain Mobile
- ✅ **Keychain Mobile integration** - Launch Keychain via deep links
- ✅ **AsyncStorage token persistence** - Securely store authentication tokens
- ✅ **Testing simulation** - Built-in success/error simulation for development
- ✅ **TypeScript support** - Full type safety throughout the application

## 🔄 HiveAuth Flow

1. **Create Login Request**: Generate UUID and send to HiveAuth server
2. **Receive Challenge**: Get authentication challenge from server
3. **Open Keychain**: Launch Hive Keychain Mobile via deep link
4. **User Authentication**: User signs in Keychain app
5. **Receive Callback**: App receives callback with session token
6. **Store Token**: Persist token in AsyncStorage for future use

## 🛠 Tech Stack

- **React Native** 0.76.0
- **Expo** ~52.0.0
- **TypeScript**
- **React Navigation** - For screen navigation
- **Expo Linking** - Deep link handling
- **AsyncStorage** - Token persistence
- **UUID** - Unique request generation

## 📁 Project Structure

```
├── app/
│   ├── index.tsx              # Main navigation screen
│   └── hiveauth-demo.tsx      # HiveAuth login demo
├── lib/
│   ├── hiveauth-service.ts    # HiveAuth API integration
│   ├── hive-service.ts        # Hive blockchain service
│   └── auth-service.ts        # Legacy authentication service
├── assets/                    # Static assets
├── .github/
│   └── copilot-instructions.md
├── package.json
├── app.json                   # Expo configuration (deep link scheme: myapp://)
├── tsconfig.json              # TypeScript configuration
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Expo CLI (`npm install -g @expo/cli`)
- Expo Go app on your mobile device (for testing)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

1. Start the Expo development server:
   ```bash
   npm start
   ```

2. Open the app:
   - **Mobile**: Scan the QR code with Expo Go app
   - **Web**: Press `w` in the terminal or visit `http://localhost:8081`
   - **Android Emulator**: Press `a` in the terminal
   - **iOS Simulator**: Press `i` in the terminal

## 📱 Using the HiveAuth Demo

### Step 1: Launch Demo
1. Open the app and tap "HiveAuth Login Demo"
2. You'll see the main HiveAuth interface

### Step 2: Initiate Login
1. Tap "Login with HiveAuth" 
2. The app creates a login request with UUID for user "demo-user"
3. Request is sent to HiveAuth server (https://hiveauth.herokuapp.com/api/auth/request)

### Step 3: Deep Link Handling
1. App generates Keychain deep link: `keychain://hiveauth/?uuid=<uuid>&challenge=<challenge>`
2. On mobile: Automatically opens Hive Keychain Mobile
3. On web/simulator: Shows deep link URL for inspection

### Step 4: Authentication Callback
1. Keychain sends callback: `myapp://hiveauth/callback?uuid=<uuid>&status=ok&token=<token>`
2. App intercepts the deep link and processes the response
3. Token is stored in AsyncStorage

### Step 5: Testing Simulation
- **Simulate Success**: Creates mock successful authentication
- **Simulate Error**: Creates mock failed authentication
- Perfect for development and testing

## ⚙️ Configuration

### Deep Link Scheme
The app is configured with `myapp://` scheme in `app.json`:

```json
{
  "expo": {
    "scheme": "myapp"
  }
}
```

### HiveAuth Server
Default server: `https://hiveauth.herokuapp.com/api`

You can modify the server URL in `lib/hiveauth-service.ts`:

```typescript
const HIVEAUTH_API_BASE = 'https://your-hiveauth-server.com/api';
```

## 🔧 Development Features

### Logging
- All authentication steps are logged to console
- Deep link events are tracked
- API responses are logged for debugging

### Error Handling
- Graceful fallback when HiveAuth server is unavailable
- Mock challenge generation for offline testing
- Clear error messages for failed authentication

### Testing Tools
- Built-in simulation buttons for success/error scenarios
- Deep link URL display for manual testing
- Request details inspection (UUID, challenge, etc.)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Todo

- [ ] Implement real authentication UI
- [ ] Add transaction signing capabilities
- [ ] Create key generation/import functionality
- [ ] Add more Hive operations (posting, voting, etc.)
- [ ] Implement QR code scanning for key import
- [ ] Add multi-account support
- [ ] Create settings screen

## Security Notes

⚠️ **Important**: This is a development/testing application. For production use:

- Implement proper key generation
- Add biometric authentication
- Use hardware security modules where possible
- Validate all user inputs
- Implement proper error handling
- Use secure communication channels

## License

This project is for educational and testing purposes. Please ensure compliance with your local regulations when using blockchain technologies.

## Support

For questions about Hive blockchain development, visit:
- [Hive Developer Portal](https://developers.hive.io/)
- [Hive Community](https://hive.io/)
- [dhive Documentation](https://gitlab.syncad.com/hive/dhive)
