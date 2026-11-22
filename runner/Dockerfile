# Self-hosted GitHub Actions runner (Linux x64, for Docker Desktop on Windows/WSL2)
FROM ubuntu:24.04

ARG RUNNER_VERSION=2.338.2
ARG NODE_MAJOR=22
ARG CLAUDE_VERSION=2.1.309
ARG BUN_VERSION=1.3.14
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq unzip sudo gnupg bash build-essential \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Non-root user (ubuntu 24.04 already ships uid 1000 "ubuntu"; remove it)
RUN userdel -r ubuntu 2>/dev/null || true \
    && useradd -m -s /bin/bash runner \
    && echo "runner ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/runner

USER runner
WORKDIR /home/runner
ENV PATH="/home/runner/.local/bin:/home/runner/.bun/bin:${PATH}"

# Claude Code (pinned) -> ~/.local/bin/claude
RUN curl -fsSL https://claude.ai/install.sh | bash -s ${CLAUDE_VERSION}

# Bun (pinned) -> ~/.bun/bin/bun
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"

# GitHub Actions runner
RUN mkdir actions-runner && cd actions-runner \
    && curl -fsSL -o runner.tar.gz \
       https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz \
    && tar xzf runner.tar.gz && rm runner.tar.gz \
    && sudo ./bin/installdependencies.sh

WORKDIR /home/runner/actions-runner
CMD ["bash"]
