#!/bin/bash

echo "Starting deployment process..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Generate Prisma client
echo "Generating Prisma client..."
npm run db:generate

# Build the application
echo "Building the application..."
npm run build

# Check if build was successful
if [ -f "dist/server.js" ]; then
    echo "Build successful! Starting the server..."
    npm start
else
    echo "Build failed! dist/server.js not found."
    exit 1
fi 