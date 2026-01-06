
import { Contact } from './types';

/**
 * Azure Integration Layer for "WithYou"
 * 
 * Services Integrated:
 * 1. Azure Communication Services (ACS): For multi-channel alerts (SMS, Voice, Push).
 * 2. Azure Functions: Serverless backend triggers for dispatch logic.
 * 3. Azure Cognitive Services: Anomaly Detector for identifying unusual risk patterns.
 */

export const sendEmergencyAlert = async (contacts: Contact[], location: string, riskLevel: number) => {
  if (contacts.length === 0) return;

  const timestamp = new Date().toISOString();
  
  console.log(`[WithYou] ⚡ Triggering Azure Function: 'EmergencyDispatch'`);
  console.log(`[Azure Function] Payload: { location: '${location}', risk: ${riskLevel}, time: '${timestamp}' }`);

  // Group contacts
  const emailContacts = contacts.filter(c => c.type === 'email');
  const smsContacts = contacts.filter(c => c.type === 'phone');

  try {
    // --- Azure Communication Services (ACS) Simulation ---
    
    // 1. SMS Alerts via ACS
    if (smsContacts.length > 0) {
      console.log(`[Azure ACS] 📡 Gateway: Sending SMS Alerts...`);
      smsContacts.forEach(contact => {
        console.log(`   ➔ 📨 SMS to ${contact.value}: "WITHYOU ALERT: Family SOS triggered. Location: ${location}."`);
      });
      
      // Feature: Automated Voice Call
      console.log(`[Azure ACS] 📡 Gateway: Initiating Automated Voice Calls...`);
      smsContacts.forEach(contact => {
        console.log(`   ➔ 📞 Calling ${contact.value}... Playing TTS: "This is a WithYou emergency alert..."`);
      });
    }

    // 2. Email Alerts via ACS
    if (emailContacts.length > 0) {
      console.log(`[Azure ACS] 📡 Gateway: Dispatching Emails...`);
      emailContacts.forEach(contact => {
        console.log(`   ➔ 📧 Email to ${contact.value} | Subject: "URGENT: Family Member Needs Help"`);
      });
    }

    // 3. App Notifications (via Azure Notification Hubs linked to ACS)
    console.log(`[Azure ACS] 🔔 Pushing notification to Trusted Circle devices via Notification Hub...`);

    return { success: true, timestamp };
  } catch (error) {
    console.error("[Azure Integration] Dispatch Failed:", error);
    return { success: false, error };
  }
};

/**
 * Azure Cognitive Services: Anomaly Detector
 * Analyzes the recent history of risk levels to detect sudden spikes or unusual patterns
 * that indicate a genuine emergency versus a false positive.
 */
export const detectRiskAnomaly = async (riskHistory: {time: number, risk: number}[]) => {
  // In production, this would POST to the Anomaly Detector API endpoint
  console.log("[Azure Cognitive Services] 🧠 Analyzing Risk Pattern for Anomalies...");
  
  const recentRisk = riskHistory[riskHistory.length - 1].risk;
  const previousRisk = riskHistory.length > 1 ? riskHistory[riskHistory.length - 2].risk : 0;
  
  // Simulated Anomaly Logic
  const isAnomaly = (recentRisk - previousRisk) > 30 || recentRisk > 80;

  if (isAnomaly) {
    console.log("[Azure Cognitive Services] ⚠️ ANOMALY DETECTED: Sudden Escalation detected.");
    return { isAnomaly: true, confidence: 0.98, severity: 'high' };
  }
  
  return { isAnomaly: false, confidence: 0.95, severity: 'low' };
};
