export function canSeePhoto(viewerId:string,author:{id:string;share_tasks?:boolean;share_proof?:boolean},friendIds:string[]){
 return viewerId===author.id||(friendIds.includes(author.id)&&author.share_tasks===true&&author.share_proof===true);
}
