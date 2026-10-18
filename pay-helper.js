// Talks to the secure payment function on Supabase (the "paystack" function).
// Returns its answer, or throws an Error with a readable message.
// Needs config.js to load first (it provides "db").
async function callPayments(body) {
  const { data, error } = await db.functions.invoke("paystack", { body: body });

  if (error) {
    let message = error.message;
    try {
      const details = await error.context.json();
      if (details.error) message = details.error;
    } catch (e) {}
    throw new Error(message);
  }
  return data;
}
