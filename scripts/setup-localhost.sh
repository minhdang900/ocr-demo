#!/bin/bash

# Xtracta OCR - Localhost Development Setup Script
echo "🚀 Setting up Xtracta OCR for Localhost Development..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if pnpm is installed
print_status "Checking pnpm installation..."
if ! command -v pnpm &> /dev/null; then
    print_error "pnpm is not installed. Please install pnpm first:"
    echo "   npm install -g pnpm"
    exit 1
fi

print_success "pnpm version: $(pnpm --version)"

# Check if PM2 is installed
print_status "Checking PM2 installation..."
if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 is not installed. Installing PM2 for process management..."
    npm install -g pm2
    if [ $? -ne 0 ]; then
        print_error "Failed to install PM2. Please install PM2 manually:"
        echo "   npm install -g pm2"
        exit 1
    fi
    print_success "PM2 installed successfully"
else
    print_success "PM2 version: $(pm2 --version)"
fi

# Check if Node.js is installed
print_status "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18+ is required. Current version: $(node --version)"
    exit 1
fi

print_success "Node.js version: $(node --version)"

# Check if Python is installed
print_status "Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    print_error "Python 3.11+ is not installed. Please install Python first."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 11 ]); then
    print_error "Python 3.11+ is required. Current version: $PYTHON_VERSION"
    exit 1
fi

# Check for Python 3.13+ and warn about potential compatibility issues
if [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -ge 13 ]; then
    print_warning "Python 3.13+ detected. Some dependencies may have compatibility issues."
    print_warning "If you encounter problems, consider using Python 3.11 or 3.12."
fi

print_success "Python version: $PYTHON_VERSION"

# Create environment file
print_status "Setting up environment configuration..."
if [ ! -f .env ]; then
    cp env.example .env
    print_success ".env file created from template"
else
    print_warning ".env file already exists"
fi

# Install dependencies
print_status "Installing project dependencies..."
pnpm install

if [ $? -ne 0 ]; then
    print_error "Failed to install dependencies"
    exit 1
fi

print_success "Dependencies installed successfully"

# Build packages
print_status "Building packages..."
pnpm run build

if [ $? -ne 0 ]; then
    print_error "Failed to build packages"
    exit 1
fi

print_success "Packages built successfully"

# Create uploads directory
print_status "Creating uploads directory..."
mkdir -p uploads
print_success "Uploads directory created"

# Setup Python virtual environment for OCR service
print_status "Setting up Python virtual environment..."
cd services/ocr

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    print_success "Python virtual environment created"
else
    print_warning "Python virtual environment already exists"
fi

# Activate virtual environment and install dependencies
source .venv/bin/activate
pip install --upgrade pip setuptools wheel

# Install dependencies with better error handling
print_status "Installing Python dependencies..."

# Use the standard requirements file
REQ_FILE="requirements.txt"
print_status "Using standard requirements file"

if pip install -r "$REQ_FILE"; then
    print_success "Python dependencies installed"
else
    print_warning "Some dependencies failed to install, trying with --no-deps..."
    pip install --no-deps -r "$REQ_FILE" || {
        print_error "Failed to install Python dependencies"
        print_warning "You may need to install system dependencies or use a different Python version"
        print_warning "Try: brew install libjpeg zlib (on macOS) or apt-get install libjpeg-dev zlib1g-dev (on Ubuntu)"
        print_warning "Alternative: Use Python 3.11 or 3.12 for better compatibility"
        exit 1
    }
fi

print_success "Python dependencies installed"
deactivate

cd ../..

# Create MongoDB data directory
print_status "Creating MongoDB data directory..."
mkdir -p data/mongodb
print_success "MongoDB data directory created"

# Create Redis data directory
print_status "Creating Redis data directory..."
mkdir -p data/redis
print_success "Redis data directory created"

# Create logs directory for PM2
print_status "Creating logs directory..."
mkdir -p logs
print_success "Logs directory created"

# Start services with PM2
print_status "Starting services with PM2..."
if pm2 start ecosystem.config.js; then
    print_success "All services started successfully with PM2"
    
    # Wait a moment for services to start
    sleep 3
    
    # Show service status
    print_status "Service status:"
    pm2 status
    
    # Show access information
    echo ""
    print_success "🌐 Services are now running:"
    echo "   - Frontend: http://localhost:3000"
    echo "   - API Gateway: http://localhost:3001"
    echo "   - API Documentation: http://localhost:3001/api/docs"
    echo "   - OCR Service: http://localhost:8001"
    echo "   - OCR Documentation: http://localhost:8001/docs"
    echo ""
    print_success "📊 PM2 Management Commands:"
    echo "   - View logs: ${GREEN}pm2 logs${NC}"
    echo "   - Check status: ${GREEN}pm2 status${NC}"
    echo "   - Restart all: ${GREEN}pm2 restart all${NC}"
    echo "   - Stop all: ${GREEN}pm2 stop all${NC}"
    echo "   - Remove from PM2: ${GREEN}pm2 delete all${NC}"
else
    print_error "Failed to start services with PM2"
    print_warning "You can try starting services manually:"
    echo "   ${GREEN}pm2 start ecosystem.config.js${NC}"
fi

echo ""
print_success "🎉 Localhost setup completed successfully!"
echo ""
echo "📋 Services are now running! Next steps:"
echo "1. Update .env file with your OCR API key and other configuration"
echo "2. Access your services:"
echo ""
echo "   Option A: Services are already running with PM2 (Recommended)"
echo "   ${GREEN}pm2 logs${NC}                    # View all logs"
echo "   ${GREEN}pm2 status${NC}                  # Check service status"
echo ""
echo "   Option B: Start services individually with PM2"
echo "   ${GREEN}pm2 start xtracta-web${NC}       # Frontend (Next.js) - http://localhost:3000"
echo "   ${GREEN}pm2 start xtracta-gateway${NC}   # API Gateway (NestJS) - http://localhost:3001"
echo "   ${GREEN}pm2 start xtracta-ocr${NC}       # OCR Service (Python) - http://localhost:8001"
echo ""
echo "   Option C: Start services individually (without PM2)"
echo "   ${GREEN}pnpm dev:web${NC}                # Frontend (Next.js) - http://localhost:3000"
echo "   ${GREEN}pnpm dev:gateway${NC}            # API Gateway (NestJS) - http://localhost:3001"
echo "   ${GREEN}cd services/ocr && ./start_server.sh${NC}  # OCR Service - http://localhost:8001"
echo ""
echo "3. Start supporting services (optional but recommended):"
echo "   ${GREEN}mongod --dbpath ./data/mongodb${NC}  # MongoDB - localhost:27017"
echo "   ${GREEN}redis-server --dir ./data/redis${NC} # Redis - localhost:6379"
echo ""
echo "   Or use Docker for supporting services only:"
echo "   ${GREEN}docker run -d --name mongodb -p 28017:27017 -v ./data/mongodb:/data/db mongo:7${NC}"
echo "   ${GREEN}docker run -d --name redis -p 6479:6379 -v ./data/redis:/data redis:7-alpine${NC}"
echo ""
echo "🌐 Access the application:"
echo "   - Frontend: http://localhost:3000"
echo "   - API Gateway: http://localhost:3001"
echo "   - API Documentation: http://localhost:3001/api/docs"
echo "   - OCR Service: http://localhost:8001"
echo "   - MongoDB: localhost:27017 (if running locally) or localhost:28017 (if using Docker)"
echo "   - Redis: localhost:6379 (if running locally) or localhost:6479 (if using Docker)"
echo ""
echo "📚 For more information, see README.md"
echo ""
echo "🔧 Development Tips:"
echo "   - Use 'pm2 start ecosystem.config.js' to start all services"
echo "   - Use 'pm2 logs' to view all service logs"
echo "   - Use 'pm2 status' to check service status"
echo "   - Use 'pm2 restart all' to restart all services"
echo "   - Use 'pm2 stop all' to stop all services"
echo "   - Use 'pm2 delete all' to remove all services from PM2"
echo "   - Use 'pnpm clean' to clean build artifacts"
echo "   - Use 'pnpm lint' to check code quality"
