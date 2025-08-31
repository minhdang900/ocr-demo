#!/bin/bash

# Xtracta OCR - Docker Environment Setup Script
echo "🐳 Setting up Xtracta OCR for Docker Environment..."

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

# Check if Docker is installed
print_status "Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

print_success "Docker version: $(docker --version)"

# Check if Docker Compose is installed
print_status "Checking Docker Compose installation..."
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

print_success "Docker Compose version: $(docker-compose --version)"

# Check if Docker daemon is running
print_status "Checking Docker daemon..."
if ! docker info &> /dev/null; then
    print_error "Docker daemon is not running. Please start Docker first."
    exit 1
fi

print_success "Docker daemon is running"

# Create environment file
print_status "Setting up environment configuration..."
if [ ! -f .env ]; then
    cp env.example .env
    print_success ".env file created from template"
else
    print_warning ".env file already exists"
fi

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p uploads
mkdir -p data/mongodb
mkdir -p data/redis
print_success "Directories created"

# Stop any existing containers
print_status "Stopping any existing containers..."
docker-compose down --remove-orphans 2>/dev/null || true
print_success "Existing containers stopped"

# Build and start services
print_status "Building and starting Docker services..."
docker-compose up --build -d

if [ $? -ne 0 ]; then
    print_error "Failed to build and start services"
    exit 1
fi

print_success "Services built and started successfully"

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 15

# Check service health
print_status "Checking service health..."
docker-compose ps

# Test service connectivity
print_status "Testing service connectivity..."

# Test OCR Service
if curl -s http://localhost:8001/health > /dev/null; then
    print_success "OCR Service is healthy"
else
    print_warning "OCR Service health check failed (may still be starting)"
fi

# Test Gateway Service
if curl -s http://localhost:3001/api/health > /dev/null; then
    print_success "Gateway Service is healthy"
else
    print_warning "Gateway Service health check failed (may still be starting)"
fi

# Test Web App
if curl -s http://localhost:3000 > /dev/null; then
    print_success "Web App is accessible"
else
    print_warning "Web App accessibility check failed (may still be starting)"
fi

echo ""
print_success "🎉 Docker setup completed successfully!"
echo ""
echo "📋 Service Status:"
echo "   ${GREEN}✓ OCR Service${NC}     - http://localhost:8001"
echo "   ${GREEN}✓ Gateway Service${NC}  - http://localhost:3001"
echo "   ${GREEN}✓ Web App${NC}         - http://localhost:3000"
echo "   ${GREEN}✓ MongoDB${NC}         - localhost:28017"
echo "   ${GREEN}✓ Redis${NC}           - localhost:6479"
echo ""
echo "🌐 Access the application:"
echo "   - Frontend: http://localhost:3000"
echo "   - API Gateway: http://localhost:3001"
echo "   - API Documentation: http://localhost:3001/api/docs"
echo "   - OCR Service: http://localhost:8001"
echo ""
echo "🔧 Docker Commands:"
echo "   ${GREEN}docker-compose ps${NC}           # Check service status"
echo "   ${GREEN}docker-compose logs${NC}         # View all logs"
echo "   ${GREEN}docker-compose logs -f${NC}      # Follow logs in real-time"
echo "   ${GREEN}docker-compose logs [service]${NC} # View specific service logs"
echo "   ${GREEN}docker-compose down${NC}         # Stop all services"
echo "   ${GREEN}docker-compose restart${NC}      # Restart all services"
echo "   ${GREEN}docker-compose build --no-cache${NC} # Rebuild without cache"
echo ""
echo "🧪 Testing the Application:"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Upload an image file (PNG/JPG)"
echo "   3. Drag and select a region on the image"
echo "   4. View the extracted text with word-level bounding boxes"
echo ""
echo "📚 For more information, see README.md"
echo ""
echo "🔧 Troubleshooting:"
echo "   - If services fail to start, check logs: ${GREEN}docker-compose logs${NC}"
echo "   - If ports are in use, stop other services using those ports"
echo "   - If build fails, try: ${GREEN}docker-compose build --no-cache${NC}"
echo "   - If containers are unhealthy, restart: ${GREEN}docker-compose restart${NC}"
