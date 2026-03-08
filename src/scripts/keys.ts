import db from "@/config/db-config";
(async function getMasterSeed() {
    const masterSeed = await db.systemConfig.findUnique(
        {
            where: { 
                key: "master_seed" 
            }
        }
    )
    console.log(masterSeed);
})()
