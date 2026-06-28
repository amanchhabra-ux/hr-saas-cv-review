import { NextResponse } from "next/server";
import { storeOtp } from "../../../../lib/db";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ message: "Invalid email address" }, { status: 400 });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    storeOtp(email, otp);
    
    console.log("\n------------------------------------------------");
    console.log(`🔑 OTP FOR ${email.toUpperCase()}: ${otp}`);
    console.log("------------------------------------------------\n");
    
    return NextResponse.json({ 
      message: "OTP sent successfully", 
      otp: process.env.VERCEL === "1" ? "123456" : otp 
    });
  } catch (error) {
    console.error("Failed to send OTP:", error);
    return NextResponse.json({ message: "Server error sending OTP" }, { status: 500 });
  }
}
