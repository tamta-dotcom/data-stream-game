import DataStreamGame from "./components/DataStreamGame";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center py-12">
      {/* 
        You can add your portfolio introduction or other 
        components above or below the game here. 
      */}
      
      <div className="text-center">
        {/* <h1 className="text-3xl font-bold text-white mb-2">My Data Projects</h1>
        <p className="text-[#8b949e]">Play the game below to generate real-time telemetry data.</p> */}
      </div>

      {/* Render the Game Component */}
      <DataStreamGame />
      
    </main>
  );
}