#!/bin/bash
# Build and optimization scripts for Docker images

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# 1. Build with BuildKit and Multi-platform Support
# ============================================================================
build_multiarch() {
    echo -e "${GREEN}Building multi-architecture images...${NC}"
    
    docker buildx build \
        --platform linux/amd64,linux/arm64 \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg GIT_COMMIT="$(git rev-parse --short HEAD)" \
        --cache-from type=registry,ref=myregistry.com/myapp:cache \
        --cache-to type=registry,ref=myregistry.com/myapp:cache,mode=max \
        -f apps/server/Dockerfile \
        -t myapp-server:latest \
        --push \
        .
}

# ============================================================================
# 2. Local Build with Cache
# ============================================================================
build_local() {
    echo -e "${GREEN}Building server image locally...${NC}"
    
    DOCKER_BUILDKIT=1 docker build \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg GIT_COMMIT="$(git rev-parse --short HEAD)" \
        -f apps/server/Dockerfile \
        -t myapp-server:latest \
        .
    
    echo -e "${GREEN}Building web image locally...${NC}"
    
    DOCKER_BUILDKIT=1 docker build \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg GIT_COMMIT="$(git rev-parse --short HEAD)" \
        -f apps/web/Dockerfile \
        -t myapp-web:latest \
        .
}

# ============================================================================
# 3. Size Comparison Report
# ============================================================================
size_report() {
    echo -e "${YELLOW}=== Docker Image Size Report ===${NC}"
    
    # Get sizes
    SERVER_SIZE=$(docker images myapp-server:latest --format "{{.Size}}")
    WEB_SIZE=$(docker images myapp-web:latest --format "{{.Size}}")
    
    echo -e "Server Image: ${GREEN}${SERVER_SIZE}${NC}"
    echo -e "Web Image: ${GREEN}${WEB_SIZE}${NC}"
    
    # Show layers
    echo -e "\n${YELLOW}=== Layer Breakdown (Server) ===${NC}"
    docker history myapp-server:latest --human --no-trunc
}

# ============================================================================
# 4. Security Scan
# ============================================================================
security_scan() {
    echo -e "${YELLOW}=== Running Security Scans ===${NC}"
    
    # Docker Scout (if available)
    if command -v docker scout &> /dev/null; then
        echo -e "${GREEN}Running Docker Scout...${NC}"
        docker scout cves myapp-server:latest
        docker scout cves myapp-web:latest
    fi
    
    # Trivy (if available)
    if command -v trivy &> /dev/null; then
        echo -e "${GREEN}Running Trivy scan...${NC}"
        trivy image myapp-server:latest
        trivy image myapp-web:latest
    else
        echo -e "${YELLOW}Install Trivy: https://github.com/aquasecurity/trivy${NC}"
    fi
}

# ============================================================================
# 5. Performance Test
# ============================================================================
performance_test() {
    echo -e "${YELLOW}=== Performance Tests ===${NC}"
    
    # Build time test
    echo -e "${GREEN}Testing build time (no cache)...${NC}"
    time docker build --no-cache -f apps/server/Dockerfile -t test:nocache .
    
    echo -e "${GREEN}Testing build time (with cache)...${NC}"
    time docker build -f apps/server/Dockerfile -t test:cache .
    
    # Startup time test
    echo -e "${GREEN}Testing startup time...${NC}"
    docker run --rm myapp-server:latest &
    PID=$!
    sleep 2
    kill $PID 2>/dev/null
}

# ============================================================================
# 6. Clean Build (No Cache)
# ============================================================================
clean_build() {
    echo -e "${YELLOW}=== Clean Build (No Cache) ===${NC}"
    
    docker build --no-cache \
        --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --build-arg GIT_COMMIT="$(git rev-parse --short HEAD)" \
        -f apps/server/Dockerfile \
        -t myapp-server:latest \
        .
}

# ============================================================================
# 7. Optimize Existing Images (Squash)
# ============================================================================
squash_image() {
    echo -e "${YELLOW}=== Squashing Image Layers ===${NC}"
    
    # Note: Requires experimental features enabled
    docker build --squash \
        -f apps/server/Dockerfile \
        -t myapp-server:squashed \
        .
    
    # Compare sizes
    ORIGINAL=$(docker images myapp-server:latest --format "{{.Size}}")
    SQUASHED=$(docker images myapp-server:squashed --format "{{.Size}}")
    
    echo -e "Original: ${ORIGINAL}"
    echo -e "Squashed: ${GREEN}${SQUASHED}${NC}"
}

# ============================================================================
# 8. Export Size Report to JSON
# ============================================================================
export_metrics() {
    echo -e "${GREEN}Exporting metrics...${NC}"
    
    cat > image-metrics.json <<EOF
{
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "commit": "$(git rev-parse --short HEAD)",
  "images": {
    "server": {
      "size": "$(docker images myapp-server:latest --format '{{.Size}}')",
      "layers": $(docker history myapp-server:latest --format json | wc -l)
    },
    "web": {
      "size": "$(docker images myapp-web:latest --format '{{.Size}}')",
      "layers": $(docker history myapp-web:latest --format json | wc -l)
    }
  }
}
EOF
    
    echo -e "${GREEN}Metrics saved to image-metrics.json${NC}"
    cat image-metrics.json
}

# ============================================================================
# 9. Compare Before/After Optimization
# ============================================================================
compare_optimization() {
    echo -e "${YELLOW}=== Optimization Comparison ===${NC}"
    
    # Build old version
    docker build -f Dockerfile.old -t myapp:old .
    OLD_SIZE=$(docker images myapp:old --format "{{.Size}}")
    
    # Build new version
    docker build -f apps/server/Dockerfile -t myapp:new .
    NEW_SIZE=$(docker images myapp:new --format "{{.Size}}")
    
    echo -e "Before: ${RED}${OLD_SIZE}${NC}"
    echo -e "After:  ${GREEN}${NEW_SIZE}${NC}"
    
    # Calculate reduction
    OLD_BYTES=$(docker inspect myapp:old --format='{{.Size}}')
    NEW_BYTES=$(docker inspect myapp:new --format='{{.Size}}')
    REDUCTION=$(echo "scale=2; (($OLD_BYTES - $NEW_BYTES) / $OLD_BYTES) * 100" | bc)
    
    echo -e "Reduction: ${GREEN}${REDUCTION}%${NC}"
}

# ============================================================================
# 10. Quick Validation Test
# ============================================================================
validate() {
    echo -e "${YELLOW}=== Validating Images ===${NC}"
    
    # Test server
    echo -e "${GREEN}Testing server...${NC}"
    docker run -d --name test-server -p 3000:3000 myapp-server:latest
    sleep 3
    if curl -f http://localhost:3000/health; then
        echo -e "${GREEN}✓ Server is healthy${NC}"
    else
        echo -e "${RED}✗ Server health check failed${NC}"
    fi
    docker rm -f test-server
    
    # Test web
    echo -e "${GREEN}Testing web...${NC}"
    docker run -d --name test-web -p 3001:3001 myapp-web:latest
    sleep 3
    if curl -f http://localhost:3001; then
        echo -e "${GREEN}✓ Web is healthy${NC}"
    else
        echo -e "${RED}✗ Web health check failed${NC}"
    fi
    docker rm -f test-web
}

# ============================================================================
# Main Menu
# ============================================================================
main() {
    echo -e "${YELLOW}"
    echo "================================================"
    echo "  Docker Build & Optimization Tools"
    echo "================================================"
    echo -e "${NC}"
    echo "1. Build locally with cache"
    echo "2. Build multi-architecture"
    echo "3. Clean build (no cache)"
    echo "4. Size report"
    echo "5. Security scan"
    echo "6. Performance test"
    echo "7. Validate images"
    echo "8. Compare optimization"
    echo "9. Export metrics"
    echo "0. Exit"
    echo ""
    read -p "Select option: " choice
    
    case $choice in
        1) build_local ;;
        2) build_multiarch ;;
        3) clean_build ;;
        4) size_report ;;
        5) security_scan ;;
        6) performance_test ;;
        7) validate ;;
        8) compare_optimization ;;
        9) export_metrics ;;
        0) exit 0 ;;
        *) echo -e "${RED}Invalid option${NC}" ;;
    esac
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main
fi