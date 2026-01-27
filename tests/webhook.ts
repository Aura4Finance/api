//spin up a simple server listing on port 5000 to listem on incoming webhooks
import express from "express";
const app = express();
const PORT = 5000;
app.use(express.json());

app.post("/orafi/webhook", (req, res) => {
    console.log("Received webhook:", req.body);
    res.status(200).send("Webhook received");
});

app.listen(PORT, () => {
    console.log(`Webhook listener running on port ${PORT}`);
});