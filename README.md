<div align="center">

# 🤖 AI Restaurant Widget

A React + TypeScript component library for integrating AI voice conversations into any website. Customers can talk to an AI agent to place food orders, ask questions, and pay bills using natural language.

**Status:** MVP - Focuses on core functionality for quick integration

</div>

---

## 📸 Widget Interface

<div align="center">

<img src="./docs/img.png" width="250" alt="Widget Interface 1" />
<img src="./docs/img_1.png" width="250" alt="Widget Interface 2" />

</div>

---

## 🎯 What Is This?

This is a **standalone reusable React component** you can extract and embed in any website. It's part of a 3-part system:

1. **Backend** (NestJS) - [ai-agent-restaurant-backend](https://github.com/buzadandeveloper/ai-agent-restaurant-backend)
   - Stores restaurants, menus, tables, orders
   - Manages AI sessions and tool execution
   - Validates all backend operations

2. **Dashboard** (React) - [ai-agent-restaurant-frontend](https://github.com/buzadandeveloper/ai-agent-restaurant-frontend)
   - Restaurant owner admin panel
   - Create menus, manage restaurants, view orders

3. **Widget** (This Project)
   - Drop into any website
   - Customers interact with AI to order food

---

## 🚀 Quick Start

### Extract & Use in Your Website

```bash
# 1. Copy only the lib folder to your project
cp -r src/lib your-website/src/

# 2. No dependencies needed! Uses native fetch + Web Audio API

# 3. Import and use
```

```jsx
import { AiAgentWidget } from "./lib";

export default function App() {
  return (
    <AiAgentWidget
      configKey="acc_6d7a43da2e53aa74"
      url="http://localhost:3000"
      aiProviderUrl="https://api.openai.com/v1/realtime/sessions"
      aiProviderApiKey="sk-proj-xxxxx"
      aiRtcProviderUrl="https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"
    />
  );
}
```

That's it! The widget is now in your site.

---

## 📋 Props (Configuration)

| Prop               | Required | Example | Purpose |
|--------------------|----------|---------|---------|
| `configKey`        | ✅ | `acc_6d7a43da2e53aa74` | Connects to your restaurant in the backend |
| `url`              | ✅ | `http://localhost:3000` | Your backend API URL |
| `aiProviderUrl`    | ✅ | `https://api.openai.com/v1/realtime/sessions` | AI provider session endpoint |
| `aiProviderApiKey` | ✅ | `sk-proj-xxxxx` | Your AI provider API key |
| `aiRtcProviderUrl` | ✅ | `https://api.openai.com/v1/realtime?model=...` | AI provider WebRTC endpoint |

### How to Get Values

- **configKey** - Get from your Restaurant Dashboard (created by owner)
- **url** - Point to your backend (local dev: `http://localhost:3000`)
- **AI Provider Keys** - From OpenAI, DeepSeek, or your chosen AI provider

---

## 🔄 How It Works

### Customer Journey

```
1. Customer sees widget button (orange mic icon)
                    ↓
2. Clicks button → Grants microphone permission
                    ↓
3. Widget calls backend to create AI session
   (Backend loads restaurant menus & tables)
                    ↓
4. WebRTC connection established with AI provider
   (Customer can now talk to AI)
                    ↓
5. Customer: "I want 2 pizzas for table 5"
   AI understands → Calls backend to create order
                    ↓
6. Backend validates & creates order in database
                    ↓
7. AI confirms: "Order created for table 5!"
   Customer hears response
```

### What Backend Handles

When widget calls `POST /api/ai-agent/session`:

✅ Finds restaurant by `configKey`  
✅ Loads menu items (Pizza, Salad, etc.)  
✅ Loads table numbers  
✅ Creates knowledge base for AI  
✅ Generates AI instructions (system prompt)  
✅ Creates session with AI provider  
✅ Returns ephemeral key to widget  

### Tool Calls (What AI Can Do)

The AI calls these backend endpoints when customer orders:

**Create Order**
```
POST /api/ai-agent/tool/create-order
{ "restaurantId": 1, "tableId": 5, "items": [...] }
```

**Add Items to Order**
```
POST /api/ai-agent/tool/add-items
{ "orderId": "ord_456", "items": [...] }
```

**Pay Bill**
```
POST /api/ai-agent/tool/pay-bill
{ "tableId": 5, "amount": ... }
```

---


## 📁 How to Extract & Use

### Step 1: Copy the Library

```bash
# From ai-restaurant-widget project:
cp -r src/lib your-existing-website/src/

# Now your project has:
your-website/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── ai-agent-widget.tsx
│   │   │   └── ai-agent-widget.css
│   │   ├── services/
│   │   │   ├── api-client/
│   │   │   └── ai-agent/
│   │   ├── icons/
│   │   └── index.ts
│   └── App.tsx
```

### Step 2: Import in Your App

```jsx
// your-website/src/App.tsx
import { AiAgentWidget } from "./lib";

export default function YourWebsite() {
  return (
    <div>
      {/* Your existing content */}
      <h1>Welcome to Our Restaurant</h1>
      
      {/* Add the widget */}
      <AiAgentWidget
        configKey="YOUR_CONFIG_KEY"
        url="YOUR_BACKEND_URL"
        aiProviderUrl="YOUR_AI_PROVIDER_URL"
        aiProviderApiKey="YOUR_API_KEY"
        aiRtcProviderUrl="YOUR_WEBSOCKET_URL"
      />
    </div>
  );
}
```

### Step 3: Set Configuration

Use environment variables (never hardcode keys):

```env
# .env file
VITE_CONFIG_KEY=acc_6d7a43da2e53aa74
VITE_BACKEND_URL=http://localhost:3000
VITE_AI_PROVIDER_URL=https://api.openai.com/v1/realtime/sessions
VITE_AI_PROVIDER_KEY=sk-proj-xxxxx
VITE_AI_WS_URL=https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17
```

```jsx
<AiAgentWidget
  configKey={import.meta.env.VITE_CONFIG_KEY}
  url={import.meta.env.VITE_BACKEND_URL}
  aiProviderUrl={import.meta.env.VITE_AI_PROVIDER_URL}
  aiProviderApiKey={import.meta.env.VITE_AI_PROVIDER_KEY}
  aiRtcProviderUrl={import.meta.env.VITE_AI_WS_URL}
/>
```

---

## 🛠️ Technologies Used

- **React 19** - Component framework
- **TypeScript** - Type safety
- **Native Fetch API** - HTTP requests (no external dependencies)
- **Web Audio API** - Waveform visualization
- **WebRTC** - Real-time audio communication

---

## 💡 Example: Customer Conversation

```
Widget shows orange mic button
         ↓
Customer clicks → Grants microphone permission
         ↓
[Widget turns red, shows waveform]
Customer: "I want 2 pizzas and a salad for table 3"
         ↓
[Widget turns green, AI speaks response]
AI: "Perfect! I'll add 2 pizzas and a Caesar salad 
     for table 3. That's 225 lei."
         ↓
Customer: "Yes, that's correct"
         ↓
AI: "Great! Your order is confirmed. Is there anything else?"
         ↓
Customer: "No, I want to pay"
         ↓
AI: "Your total is 225 lei. Payment processed!
     Thank you for dining with us!"
```