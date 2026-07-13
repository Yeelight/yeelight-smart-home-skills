export function createMockHomeState(sourceFixture) {
  let fixture = structuredClone(sourceFixture);
  return {
    get fixture() { return fixture; },
    reset() { fixture = structuredClone(sourceFixture); },
  };
}
