#!/bin/bash

# Xtracta OCR Monorepo Setup Script
echo "🚀 Setting up Xtracta OCR Monorepo..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install pnpm first:"
    echo "   npm install -g pnpm"
    exit 1
fi

echo "✅ pnpm version: $(pnpm --version)"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✅ Docker is installed"

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker Compose is installed"

# Create environment file
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "✅ .env file created. Please update it with your configuration."
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build packages
echo "🔨 Building packages..."
pnpm run build

# Create uploads directory
echo "📁 Creating uploads directory..."
mkdir -p uploads

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 15

# Check if services are running
echo "🔍 Checking service status..."
if docker-compose ps | grep -q "Up"; then
    echo "✅ All services are running"
else
    echo "❌ Some services failed to start. Check docker-compose logs"
    exit 1
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Update .env file with your OCR API key and other configuration"
echo "2. Start the development servers:"
echo "   - All services: pnpm dev"
echo "   - Web only: pnpm dev:web"
echo "   - Gateway only: pnpm dev:gateway"
echo "3. Access the application:"
echo "   - Frontend: http://localhost:3000"
echo "   - API Gateway: http://localhost:3001"
echo "   - API Documentation: http://localhost:3001/api/docs"
echo "   - OCR Service (HTTP): http://localhost:8001"
echo "   - File Storage Service: tcp://localhost:8002"
echo "   - MongoDB: localhost:28017"
echo "   - Redis: localhost:6479"
echo ""
echo "🔑 Default credentials:"
echo "   - MongoDB: No authentication required (development)"
echo "   - Redis: No authentication required (development)"
echo ""
echo "📚 For more information, see README.md"
