#!/bin/bash

# Build and run Lakehouse Mirror application with Docker

set -e

echo "🏠 Lakehouse Mirror - Docker Build & Deploy Script"
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="lakehouse-mirror"
CONTAINER_NAME="lakehouse-mirror-app"
PORT="3000"

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

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_success "Created .env file from .env.example"
        print_warning "Please update .env file with your configuration before proceeding."
    else
        print_error ".env.example file not found. Cannot create .env file."
        exit 1
    fi
fi

# Stop and remove existing container
print_status "Stopping existing containers..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Build Docker image
print_status "Building Docker image..."
docker build -t $IMAGE_NAME .

if [ $? -eq 0 ]; then
    print_success "Docker image built successfully"
else
    print_error "Failed to build Docker image"
    exit 1
fi

# Run container
print_status "Starting container..."
docker run -d \
    --name $CONTAINER_NAME \
    -p $PORT:3001 \
    --env-file .env \
    --restart unless-stopped \
    $IMAGE_NAME

if [ $? -eq 0 ]; then
    print_success "Container started successfully"
    print_success "Application is running at: http://localhost:$PORT"
    
    # Wait for health check
    print_status "Waiting for application to be ready..."
    sleep 10
    
    # Check application health
    if curl -f http://localhost:$PORT/health > /dev/null 2>&1; then
        print_success "Application is healthy and ready to use!"
    else
        print_warning "Application may still be starting up. Check logs with: docker logs $CONTAINER_NAME"
    fi
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "Useful commands:"
    echo "  View logs: docker logs -f $CONTAINER_NAME"
    echo "  Stop app:  docker stop $CONTAINER_NAME"
    echo "  Start app: docker start $CONTAINER_NAME"
    echo "  Remove:    docker rm -f $CONTAINER_NAME"
    
else
    print_error "Failed to start container"
    exit 1
fi