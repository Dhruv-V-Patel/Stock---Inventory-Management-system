# Use the official Node.js Alpine Linux image for a minimal image footprint
FROM node:22-alpine


# Set the working directory inside the container
WORKDIR /

# Copy package files first to leverage Docker layer caching for dependencies
COPY package*.json ./

# Install only production dependencies to optimize image size
RUN npm install

# Copy the rest of your local application source code to the container
COPY . .

# Expose the internal port your Node app listens on (e.g., 3000)
EXPOSE 5175

# Set the active user to the pre-configured unprivileged 'node' user for security
USER node

# Define the command execution engine to spin up your application
CMD ["node", "server.js"]
