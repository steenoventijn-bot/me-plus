export function sharedIslandData(team){
 const completed=Math.max(0,Number(team.completed)||0),members=team.members||[];
 const items=[['dock_wood',14.3,15.9],['campfire',9.5,10.5],['bench_wood',7.1,11.3],['tree_oak',4,5],['tree_oak',14.3,4.8],['palm_tree',16,11]];
 if(completed>=1)items.push(['flowers_pink',4.8,10],['flowers_white',5.6,11],['bush_round',4.7,12]);
 if(completed>=3)items.push(['house_main',9.5,6.6]);
 if(completed>=5)items.push(['beach_chair',13.5,12.7],['parasols',15,13],['beach_chair',14.5,12]);
 return {owner:members[0]||{id:'crew',name:'Bemanning'},visitors:members.slice(1),isOwner:false,world:{house:{roof:'blue',walls:'cream'},world_name:'Jullie vriendeneiland'},items:items.map(([item_key,pos_x,pos_y],i)=>({id:'crew-'+i,item_key,pos_x,pos_y,rotation:0})),unlocks:['knowledge_house','knowledge_stand','knowledge_library'].map(item_key=>({item_key})),stats:{knowledge:0}};
}
