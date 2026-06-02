export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { register: registerNode } = await import("./instrumentation.node");
    await registerNode();
  }
}
