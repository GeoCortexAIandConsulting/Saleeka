import Header from '@/components/Header';
import Hero from '@/components/landing/Hero';
import LandingExperience from '@/components/landing/LandingExperience';
import { Finale, Footer, ForBrands, HowItWorks, Modesty, Privacy, SampleLooks } from '@/components/landing/Sections';

export default function Home() {
  return (
    <>
      <Header signedIn={false} />
      <LandingExperience>
        <main>
          <Hero />
          <HowItWorks />
          <Modesty />
          <SampleLooks />
          <ForBrands />
          <Privacy />
          <Finale />
        </main>
        <Footer />
      </LandingExperience>
    </>
  );
}
