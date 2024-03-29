FROM node:12.0.0
MAINTAINER simonschaerer

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json /usr/src/app/
RUN npm install

# Bundle app source
COPY . /usr/src/app

RUN npm run build

# Expose port
EXPOSE 8000

# Default command to run
CMD ["npm", "start"]
