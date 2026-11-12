import Header from '@/components/Header';
import Hero from '@/components/landing/Hero';
import { BrandTicker, Finale, Footer, ForBrands, HowItWorks, Modesty, OnTheRunway, Privacy, TryIt } from '@/components/landing/Sections';

export default function Home() {
  return (
    <>
      <Header signedIn={false} />
      <main>
        <Hero />
        <BrandTicker />
        <TryIt />
        <HowItWorks />
        <OnTheRunway />
        <Modesty />
        <ForBrands />
        <Privacy />
        <Finale />
      </main>
      <Footer />
    </>
  );
}
