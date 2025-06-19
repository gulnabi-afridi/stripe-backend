require("dotenv").config();
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Stripe Payment Backend is running");
});

// Payment endpoint
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, currency = "usd", metadata = {} } = req.body;

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error("Error creating payment intent:", err);
    res.status(500).json({ error: err.message });
  }
});

// Payment confirmation endpoint
app.post("/confirm-payment", async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: "Payment intent ID is required" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    res.json({
      status: paymentIntent.status,
      paymentIntent,
    });
  } catch (err) {
    console.error("Error confirming payment:", err);
    res.status(500).json({ error: err.message });
  }
});

// Order cancellation and refund endpoint
app.post("/cancel-order", async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: "Payment intent ID is required" });
    }

    // Retrieve the payment intent to check its status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Check if the payment was successful
    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({
        error: `Cannot refund payment with status: ${paymentIntent.status}. Only succeeded payments can be refunded.`,
      });
    }

    // Check if there's a charge to refund (there should be for succeeded payments)
    if (!paymentIntent.latest_charge) {
      return res.status(400).json({
        error: "No charge found to refund",
      });
    }

    // Create the refund
    const refund = await stripe.refunds.create({
      charge: paymentIntent.latest_charge,
    });

    // Convert amount from cents to dollars
    const amountInDollars = refund.amount / 100;
    const paymentIntentAmountInDollars = paymentIntent.amount / 100;

    res.json({
      status: refund.status,
      refundId: refund.id,
      amount_refunded: amountInDollars,
      amount_original: paymentIntentAmountInDollars,
      currency: refund.currency,
      message: "Refund processed successfully",
      metadata: {
        note: "All amounts are shown in dollars",
      },
    });
  } catch (err) {
    console.error("Error processing refund:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
