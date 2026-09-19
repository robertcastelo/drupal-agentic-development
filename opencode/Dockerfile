#ddev-generated
# OpenCode AI container for DDEV
# Ubuntu 24.04 + Node.js 22 + OpenCode + SSH client/server

FROM ubuntu:24.04

ARG USERNAME=opencode
ARG USER_UID=1000
ARG USER_GID=1000

ENV DEBIAN_FRONTEND=noninteractive
ENV USERNAME=${USERNAME}
ENV USER_HOME=/home/${USERNAME}

# Install base dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    sudo \
    ripgrep \
    fd-find \
    jq \
    vim \
    less \
    openssh-client \
    openssh-server \
    docker.io \
    && mkdir -p /var/run/sshd \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 (required by OpenCode)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create user with matching UID/GID from host
RUN existing_user=$(getent passwd ${USER_UID} | cut -d: -f1) \
    && existing_group=$(getent group ${USER_GID} | cut -d: -f1) \
    && if [ -n "$existing_user" ] && [ "$existing_user" != "${USERNAME}" ]; then \
         userdel -r $existing_user 2>/dev/null || true; \
       fi \
    && if [ -n "$existing_group" ] && [ "$existing_group" != "${USERNAME}" ]; then \
         groupdel $existing_group 2>/dev/null || true; \
       fi \
    && groupadd --gid ${USER_GID} ${USERNAME} 2>/dev/null || true \
    && useradd --uid ${USER_UID} --gid ${USER_GID} -m -s /bin/bash ${USERNAME} 2>/dev/null || true \
    && echo "${USERNAME} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/${USERNAME} \
    && chmod 0440 /etc/sudoers.d/${USERNAME} \
    && passwd -d ${USERNAME}

# Install bd wrapper — delegates to Beads container via SSH (with proper quoting)
# RUN printf '#!/bin/bash\ncmd="bd"\nfor arg in "$@"; do\n  cmd="$cmd $(printf '\''%%q'\'' "$arg")"\ndone\nexec ssh beads "$cmd"\n' > /usr/local/bin/bd \
#     && chmod +x /usr/local/bin/bd

# Configure sshd for Ralph access (hardened)
RUN mkdir -p /etc/ssh/sshd_config.d && \
    printf '#!/bin/bash\n. /etc/ddev-env 2>/dev/null\ncd /var/www/html\nif [ -n "$SSH_ORIGINAL_COMMAND" ]; then\n    eval "$SSH_ORIGINAL_COMMAND"\nelse\n    exec bash -l\nfi\n' \
    > /usr/local/bin/ai-ssh-command.sh && chmod +x /usr/local/bin/ai-ssh-command.sh

# Web-container tool wrappers over SSH (replaces docker-exec based shims).
# Args are passed via %q to preserve quoting across the SSH boundary.
COPY .ddev/opencode/web-ssh-exec /usr/local/bin/web-ssh-exec
RUN chmod +x /usr/local/bin/web-ssh-exec && \
    for entry in "drush:./vendor/bin/drush" "composer:/usr/local/bin/composer" "phpunit:./vendor/bin/phpunit" "phpstan:./vendor/bin/phpstan"; do \
      name="${entry%%:*}"; target="${entry#*:}"; \
      printf '#!/bin/bash\nexec /usr/local/bin/web-ssh-exec %s "$@"\n' "$target" > "/usr/local/bin/$name"; \
      chmod +x "/usr/local/bin/$name"; \
    done

RUN printf '%s\n' \
    'PermitRootLogin no' \
    'PasswordAuthentication no' \
    'PubkeyAuthentication yes' \
    'UsePAM no' \
    "AllowUsers ${USERNAME}" \
    'AllowTcpForwarding no' \
    'X11Forwarding no' \
    '' \
    "Match User ${USERNAME}" \
    '    ForceCommand /usr/local/bin/ai-ssh-command.sh' \
    > /etc/ssh/sshd_config.d/ai-agent.conf

# Set up SSH client config
RUN mkdir -p ${USER_HOME}/.ssh && chmod 700 ${USER_HOME}/.ssh
COPY .ddev/opencode/ssh-config ${USER_HOME}/.ssh/config
RUN chmod 600 ${USER_HOME}/.ssh/config \
    && chown -R ${USER_UID}:${USER_GID} ${USER_HOME}/.ssh

# Install Multica CLI (optional daemon — activated only if ~/.env.multica
# has MULTICA_TOKEN at container start; otherwise the binary is unused).
# Lands at /usr/local/bin/multica.
RUN curl -fsSL https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.sh \
      | bash \
    && multica --version

# Create required directories
RUN mkdir -p ${USER_HOME}/.config/opencode \
    && mkdir -p ${USER_HOME}/.local/share/opencode \
    && mkdir -p ${USER_HOME}/.npm-global \
    && mkdir -p /var/www/html \
    && chown -R ${USER_UID}:${USER_GID} ${USER_HOME} \
    && chown -R ${USER_UID}:${USER_GID} /var/www/html

USER ${USERNAME}
WORKDIR ${USER_HOME}

# Configure npm global packages in user home
ENV HOME=${USER_HOME}
ENV NPM_CONFIG_PREFIX=${USER_HOME}/.npm-global
ENV PATH="${USER_HOME}/.npm-global/bin:${PATH}"

# Install OpenCode globally
RUN npm install -g opencode-ai@1.18.31

# Install Playwright + Chromium for opencode browser interaction tools
# Also install Firefox for @playwright/mcp MCP server (chrome channel not available on ARM64)
RUN npm install -g playwright@1.63.0 \
    && npx playwright install --with-deps chromium firefox

# Install Playwright MCP server for opencode tool integration
RUN npm install -g @playwright/mcp@0.0.82

# Create useful aliases and helper functions
RUN echo 'export PATH="${HOME}/.npm-global/bin:${HOME}/go/bin:$PATH"' >> ~/.bashrc \
    && echo 'alias ll="ls -la"' >> ~/.bashrc \
    && echo '' >> ~/.bashrc \
    && echo '# Safe SSH command wrapper — preserves quoting across SSH' >> ~/.bashrc \
    && echo 'ssh-cmd() { local host="$1"; shift; local cmd=""; for arg in "$@"; do cmd="${cmd:+$cmd }$(printf "%q" "$arg")"; done; ssh "$host" "$cmd"; }' >> ~/.bashrc \
    && echo '' >> ~/.bashrc \
    && echo '# Helper functions to execute in web container via SSH' >> ~/.bashrc \
    && echo 'web-exec() { ssh-cmd web "$@"; }' >> ~/.bashrc \
    && echo 'drush() { ssh-cmd web ./vendor/bin/drush "$@"; }' >> ~/.bashrc \
    && echo 'composer() { ssh-cmd web composer "$@"; }' >> ~/.bashrc \
    && echo 'phpunit() { ssh-cmd web ./vendor/bin/phpunit "$@"; }' >> ~/.bashrc \
    && echo 'phpstan() { ssh-cmd web ./vendor/bin/phpstan "$@"; }' >> ~/.bashrc \
    && echo 'web-shell() { ssh -t web bash; }' >> ~/.bashrc \
    && echo '' >> ~/.bashrc \
    && echo 'echo "OpenCode container ready"' >> ~/.bashrc \
    && echo 'echo "   Site URL: \$DDEV_PRIMARY_URL"' >> ~/.bashrc \
    && echo 'echo ""' >> ~/.bashrc \
    && echo 'echo "Commands: opencode | drush | phpunit | phpstan | web-shell | bd"' >> ~/.bashrc \
    && echo '' >> ~/.bashrc

# Copy entrypoint script (must be done before USER switch, or use sudo)
COPY .ddev/opencode/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sudo chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

WORKDIR /var/www/html

CMD ["opencode", "serve", "--hostname", "0.0.0.0", "--port", "3000", "--mdns", "false"]

