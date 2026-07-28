import { Hero } from "@/components/features/home/Hero";
import { TrustBar } from "@/components/features/home/TrustBar";
import { Categories } from "@/components/features/home/Categories";
import { HowItWorks } from "@/components/features/home/HowItWorks";
import { Features } from "@/components/features/home/Features";
import { Testimonials } from "@/components/features/home/Testimonials";
import { CtaBanner } from "@/components/features/home/CtaBanner";

export default function Home() {
  return (
    <>
      <Hero />
      <TrustBar />
      <Categories />
      <HowItWorks />
      <Features />
      <Testimonials />
      <CtaBanner />
    </>
  );
}
