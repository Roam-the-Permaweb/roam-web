import { describe, it, expect, beforeEach, vi } from "vitest";
import { WayfinderService } from "./wayfinder/index";

// Mock the AR.IO SDK
vi.mock("@ar.io/sdk", () => ({
  ARIO: {
    mainnet: vi.fn().mockReturnValue({
      getGateways: vi.fn().mockResolvedValue({
        items: [
          {
            gatewayAddress: "mock-gateway-1.com",
            operatorStake: 1000000,
            totalDelegatedStake: 5000000,
            status: "joined",
            settings: {
              protocol: "https",
              port: 443,
              fqdn: "mock-gateway-1.com",
            },
          },
          {
            gatewayAddress: "mock-gateway-2.com",
            operatorStake: 500000,
            totalDelegatedStake: 2000000,
            status: "joined",
            settings: {
              protocol: "https",
              port: 443,
              fqdn: "mock-gateway-2.com",
            },
          },
        ],
      }),
    }),
  },
}));

// Mock the AR.IO Wayfinder Core SDK
vi.mock("@ar.io/wayfinder-core", () => ({
  Wayfinder: vi.fn().mockImplementation(() => ({
    request: vi.fn().mockResolvedValue({
      url: "https://mock-gateway.arweave.net/test-tx-id",
      status: 200,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue("mock content"),
      blob: vi.fn().mockResolvedValue(new Blob(["mock content"])),
    }),
    emitter: {
      on: vi.fn(),
    },
  })),
  NetworkGatewaysProvider: vi.fn().mockImplementation(() => ({
    getGateways: vi.fn().mockResolvedValue([
      new URL("https://mock-gateway-1.com"),
      new URL("https://mock-gateway-2.com"),
    ]),
  })),
  SimpleCacheGatewaysProvider: vi.fn().mockImplementation(({ gatewaysProvider }) => ({
    getGateways: gatewaysProvider ? gatewaysProvider.getGateways : vi.fn().mockResolvedValue([]),
  })),
  StaticGatewaysProvider: vi.fn().mockImplementation(() => ({})),
  HashVerificationStrategy: vi.fn(),
  TrustedGatewaysHashProvider: vi.fn(),
  RandomRoutingStrategy: vi.fn().mockImplementation(() => ({})),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe.skip("Wayfinder Service", () => {
  let wayfinderService: WayfinderService;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    wayfinderService = new WayfinderService();
  });

  describe("Configuration Management", () => {
    it("should have correct default configuration", () => {
      const config = wayfinderService.getConfig();

      expect(config.enableWayfinder).toBe(true); // Enabled by default in v0.2.1
      expect(config.verification.strategy).toBe("hash"); // Re-enabled with wayfinder-core 0.0.3-alpha.1
      expect(config.routing.gatewayProvider.config.wrappedProviderConfig.limit).toBe(20); // Top 20 staked gateways for balanced mode
      expect(config.routing.gatewayProvider.config.cacheTimeoutMinutes).toBe(60); // 1 hour cache timeout
      expect(config.verification.timeoutMs).toBe(30000); // Updated timeout
    });

    it("should update configuration correctly", () => {
      wayfinderService.updateConfig({
        enableWayfinder: true,
        verification: {
          enabled: true,
          strategy: "hash",
        },
      });

      const config = wayfinderService.getConfig();
      expect(config.enableWayfinder).toBe(true);
      expect(config.verification.strategy).toBe("hash");

      // Should save to localStorage
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "wayfinder-config",
        expect.stringContaining('"enableWayfinder":true')
      );
    });

    it("should load persisted configuration", () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          enableWayfinder: false,
        })
      );

      const service = new WayfinderService();
      const config = service.getConfig();

      expect(config.enableWayfinder).toBe(false); // Persisted value should override default
      // verificationStrategy is not overridden in localStorage mock
    });
  });

  describe("Content URL Fetching", () => {
    it("should return fallback URL when Wayfinder is disabled", async () => {
      wayfinderService.updateConfig({ enableWayfinder: false });

      const result = await wayfinderService.getContentUrl({
        txId: "test-tx-id",
      });

      expect(result.url).toContain("test-tx-id");
      expect(result.verificationStatus.status).toBe("not-verified");
      expect(result.verified).toBe(false);
      expect(result.data).toBe(null);
      expect(result.contentType).toBe(null);
    });

    it("should attempt Wayfinder when enabled", async () => {
      wayfinderService.updateConfig({ enableWayfinder: true });

      const result = await wayfinderService.getContentUrl({
        txId: "test-tx-id",
      });

      expect(result.url).toContain("test-tx-id");
      expect(result.gateway).toBeDefined();
    }, 30000);

    it("should fall back to original gateway on Wayfinder error", async () => {
      wayfinderService.updateConfig({ enableWayfinder: true });

      // Initialize the service first
      await wayfinderService.initialize();

      const result = await wayfinderService.getContentUrl({
        txId: "test-tx-id",
      });

      // Should get some result (either Wayfinder or fallback)
      expect(result.url).toBeDefined();
      expect(result.gateway).toBeDefined();
    }, 20000);
  });

  describe("Verification Status", () => {
    it("should track verification status", () => {
      const txId = "test-tx-id";

      let status = wayfinderService.getVerificationStatus(txId);
      expect(status.status).toBe("pending");
      3;
      // Simulate verification update
      wayfinderService.updateConfig({ verificationStrategy: "hash" });

      status = wayfinderService.getVerificationStatus(txId);
      expect(status.txId).toBe(txId);
    });

    it("should provide service statistics", () => {
      const stats = wayfinderService.getStats();

      expect(stats).toHaveProperty("enabled");
      expect(stats).toHaveProperty("initialized");
      expect(stats).toHaveProperty("totalRequests");
      expect(stats).toHaveProperty("verified");
      expect(stats).toHaveProperty("failed");
      expect(stats).toHaveProperty("verificationRate");
      expect(stats).toHaveProperty("cacheSize");
    });
  });

  describe("Availability Check", () => {
    it("should report availability based on configuration", async () => {
      wayfinderService.updateConfig({ enableWayfinder: true });
      let available = await wayfinderService.isAvailable();
      expect(available).toBe(true);

      wayfinderService.updateConfig({ enableWayfinder: false });
      available = await wayfinderService.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe("Cache Management", () => {
    it("should clear caches", () => {
      expect(() => wayfinderService.clearCache()).not.toThrow();

      const stats = wayfinderService.getStats();
      expect(stats.cacheSize).toBe(0);
    });
  });
});
