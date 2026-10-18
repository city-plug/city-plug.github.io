// Paystack sends the customer back here after paying,
// with the payment reference in the address.
(async () => {
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference") || params.get("trxref");

  const title = document.getElementById("title");
  const detail = document.getElementById("detail");

  if (!reference) {
    window.location.href = "index.html";
    return;
  }

  const { data } = await db.auth.getSession();
  if (!data.session) {
    window.location.href = "login.html";
    return;
  }

  try {
    // Ask our server to confirm the payment with Paystack
    const result = await callPayments({ action: "verify", reference: reference });

    if (result.status === "paid") {
      title.textContent = "Payment successful";
      detail.textContent =
        "Thank you! Your payment of ₦" + (result.total_kobo / 100).toLocaleString() +
        " was received.";
    } else {
      title.textContent = "Payment not completed";
      detail.textContent = "Your payment status is: " + result.status + ". You have not been charged for a completed order.";
    }
  } catch (e) {
    title.textContent = "We could not check your payment";
    detail.textContent = e.message;
  }
})();
