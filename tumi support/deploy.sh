#!/bin/bash

echo "🚀 TumiCodes Support System Deployment Script"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command succeeded
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Success${NC}"
    else
        echo -e "${RED}❌ Failed${NC}"
        exit 1
    fi
}

# Step 1: Check if all files exist
echo -e "\n📁 Checking project structure..."
if [ ! -f "backend/server.js" ]; then
    echo -e "${RED}❌ Missing backend/server.js${NC}"
    exit 1
fi

if [ ! -f "backend/package.json" ]; then
    echo -e "${RED}❌ Missing backend/package.json${NC}"
    exit 1
fi

if [ ! -f "frontend/index.html" ]; then
    echo -e "${RED}❌ Missing frontend/index.html${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Project structure looks good${NC}"

# Step 2: Check if .env.example exists
if [ ! -f ".env.example" ]; then
    echo -e "${YELLOW}⚠️  Creating .env.example file...${NC}"
    cat > .env.example << 'EOF'
# Server Configuration
PORT=3000
FRONTEND_URL=http://localhost:5500
NODE_ENV=development

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_SUPPORT_CHAT_ID=your_chat_id_here

# Session Security
SESSION_SECRET=generate_a_secure_random_string_here
EOF
    echo -e "${GREEN}✅ Created .env.example${NC}"
fi

# Step 3: Check if .gitignore exists
if [ ! -f ".gitignore" ]; then
    echo -e "${YELLOW}⚠️  Creating .gitignore file...${NC}"
    cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Runtime data
*.pid
*.seed
*.pid.lock

# Coverage directory
coverage/

# Logs
logs
*.log

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo

# Temporary files
tmp/
temp/

# Render
.render/

# Frontend build artifacts
frontend/dist/
frontend/build/
EOF
    echo -e "${GREEN}✅ Created .gitignore${NC}"
fi

# Step 4: Create render.yaml if not exists
if [ ! -f "render.yaml" ]; then
    echo -e "${YELLOW}⚠️  Creating render.yaml...${NC}"
    cat > render.yaml << 'EOF'
services:
  - type: web
    name: tumicodes-support-backend
    env: node
    region: oregon
    plan: free
    buildCommand: cd backend && npm install
    startCommand: cd backend && npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
    healthCheckPath: /health
    autoDeploy: true
    scaling:
      minInstances: 1
      maxInstances: 1
EOF
    echo -e "${GREEN}✅ Created render.yaml${NC}"
fi

# Step 5: Create Procfile if not exists
if [ ! -f "Procfile" ]; then
    echo -e "${YELLOW}⚠️  Creating Procfile...${NC}"
    echo "web: cd backend && npm start" > Procfile
    echo -e "${GREEN}✅ Created Procfile${NC}"
fi

# Step 6: Initialize git if not already
if [ ! -d ".git" ]; then
    echo -e "\n📦 Initializing git repository..."
    git init
    check_status
fi

# Step 7: Add all files
echo -e "\n📤 Adding files to git..."
git add .
check_status

# Step 8: Commit
echo -e "\n💾 Committing changes..."
git commit -m "Initial commit: TumiCodes Support Live Chat System"
check_status

echo -e "\n${GREEN}🎉 Local setup complete!${NC}"
echo -e "\n${YELLOW}📋 Next Steps:${NC}"
echo "1. Create a new repository on GitHub:"
echo "   - Go to https://github.com/new"
echo "   - Name: tumi-support"
echo "   - Make it public"
echo "   - DO NOT initialize with README"
echo ""
echo "2. Connect your local repository:"
echo "   Copy the commands from GitHub and run them"
echo ""
echo "3. After pushing to GitHub:"
echo "   - Go to https://render.com"
echo "   - Sign up/login with GitHub"
echo "   - Click 'New +' → 'Web Service'"
echo "   - Connect your repository"
echo "   - Name: tumicodes-support-backend"
echo "   - Runtime: Node"
echo "   - Build Command: cd backend && npm install"
echo "   - Start Command: cd backend && npm start"
echo "   - Add environment variables from .env.example"
echo ""
echo "4. After deployment:"
echo "   - Update frontend URLs to point to your Render URL"
echo "   - Test the system"
echo ""
echo "🚀 Happy deploying!"