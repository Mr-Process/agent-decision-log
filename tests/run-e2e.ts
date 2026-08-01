import { runApiE2ETests } from "./api-e2e.test.js";
import { runDashboardE2ETests } from "./dashboard-e2e.test.js";
import { runSdkE2ETests } from "./sdk-e2e.test.js";

async function main() {
  console.log("==========================================");
  console.log("   AGENT DECISION LOG - E2E TEST RUNNER   ");
  console.log("==========================================");

  try {
    await runApiE2ETests();
    await runDashboardE2ETests();
    await runSdkE2ETests();
    console.log("==========================================");
    console.log(" 🎉 ALL E2E TEST SUITES PASSED (100%)    ");
    console.log("==========================================");
  } catch (error: any) {
    console.error("\n❌ E2E Test Runner Failed:");
    console.error(error);
    process.exit(1);
  }
}

main();
