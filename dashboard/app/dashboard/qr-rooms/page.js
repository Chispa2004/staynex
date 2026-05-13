import { QrRoomsClient } from '@/components/QrRoomsClient';

const normalizeWhatsappNumber = (value) => (
  value?.replace(/^whatsapp:/, '').replace(/[^\d]/g, '') || ''
);

export default function QrRoomsPage() {
  const whatsappNumber = normalizeWhatsappNumber(
    process.env.TWILIO_WHATSAPP_FROM ||
    process.env.NEXT_PUBLIC_TWILIO_WHATSAPP_FROM
  );

  return <QrRoomsClient whatsappNumber={whatsappNumber} />;
}
