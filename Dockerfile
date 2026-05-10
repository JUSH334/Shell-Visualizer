FROM ubuntu:24.04
RUN apt-get update && apt-get install -y build-essential flex bison curl && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY shell/ ./shell/
RUN cd shell && make
COPY visualizer/ ./visualizer/
RUN cd visualizer && npm install && npm run build
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", "visualizer/dist", "-l", "3000"]