/* Sample community posts so the feed isn't empty in a demo. The people are made up and every
   post is labeled "Sample" in the app (they can be hidden on the Account page). The species,
   places and photos are real: photos are openly licensed iNaturalist photos, credited on each post. */
import { isTree, isOak, isConifer, groupOf, haversineKm } from './shared.js';
import { ACHIEVEMENTS } from './account.js';

// Species around De Anza College with openly licensed iNaturalist photos: used by the sample
// profiles below and by the demo journal (demo-data.js). [id, name, common, group, photo, genus id, photo credit]
export const TAXA = Object.fromEntries([
  [36204, "Sceloporus occidentalis", "Western Fence Lizard", 'Reptilia', 'inaturalist-open-data.s3.amazonaws.com/photos/36416485/medium.jpeg', 36141, "(c) Steven Kurniawidjaja, some rights reserved (CC BY-NC)"],
  [42220, "Odocoileus hemionus", "Mule Deer", 'Mammalia', 'inaturalist-open-data.s3.amazonaws.com/photos/5207830/medium.jpg', 42219, "(c) Marshal Hedin, some rights reserved (CC BY-NC-SA)"],
  [10094, "Junco hyemalis", "Dark-eyed Junco", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/111714701/medium.jpeg', 10093, "(c) Craig K. Hunt, some rights reserved (CC BY-NC)"],
  [144820, "Poecile rufescens", "Chestnut-backed Chickadee", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/57455544/medium.jpeg', 144351, "(c) Garth Harwood, some rights reserved (CC BY)"],
  [6317, "Calypte anna", "Anna's Hummingbird", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/85724236/medium.jpeg', 6315, "(c) abcdefgewing, some rights reserved (CC BY-NC)"],
  [47850, "Quercus agrifolia", "coast live oak", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/18734105/medium.jpg', 47851, "(c) Franco Folini, some rights reserved (CC BY-SA)"],
  [8021, "Corvus brachyrhynchos", "American Crow", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/24115/medium.jpg', 7998, "(c) Joe McKenna, some rights reserved (CC BY-NC)"],
  [47219, "Apis mellifera", "Western Honey Bee", 'Insecta', 'inaturalist-open-data.s3.amazonaws.com/photos/389898647/medium.jpeg', 578086, "(c) Lê Thanh Hoa, some rights reserved (CC BY-NC)"],
  [17013, "Sayornis nigricans", "Black Phoebe", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/1616631/medium.jpg', 17007, "(c) Jack Wolf, some rights reserved (CC BY-ND)"],
  [6930, "Anas platyrhynchos", "Mallard", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/95268822/medium.jpg', 6922, "(c) anonymous, some rights reserved (CC BY-SA)"],
  [199840, "Haemorhous mexicanus", "House Finch", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/254255014/medium.jpeg', 199910, "(c) Leonardo Guzmán, some rights reserved (CC BY-NC-ND)"],
  [53348, "Aesculus californica", "California buckeye", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/72460428/medium.jpg', 53350, "(c) Gary Griffith, some rights reserved (CC BY-NC-SA)"],
  [46017, "Sciurus carolinensis", "Eastern Gray Squirrel", 'Mammalia', 'inaturalist-open-data.s3.amazonaws.com/photos/22144449/medium.jpg', 1431493, "(c) Diliff, some rights reserved (CC BY-SA)"],
  [53169, "Oxalis pes-caprae", "Bermuda buttercup", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/454705867/medium.jpg', 1701120, "(c) portioid, some rights reserved (CC BY)"],
  [145308, "Spinus psaltria", "Lesser Goldfinch", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/117426725/medium.jpeg', 144410, "(c) Jeremy Gatten, some rights reserved (CC BY-NC)"],
  [3454, "Zenaida macroura", "Mourning Dove", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/14015355/medium.jpg', 3438, "(c) Donna Pomeroy, some rights reserved (CC BY-NC)"],
  [48662, "Danaus plexippus", "Monarch", 'Insecta', 'inaturalist-open-data.s3.amazonaws.com/photos/227923335/medium.jpeg', 48663, "(c) Alejandro Lopez, some rights reserved (CC BY-NC-SA)"],
  [53405, "Heteromeles arbutifolia", "Toyon", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/342304993/medium.jpg', 53408, "(c) Jiovanny Celis, some rights reserved (CC BY-NC)"],
  [13633, "Baeolophus inornatus", "Oak Titmouse", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/74432029/medium.jpeg', 13629, "(c) abcdefgewing, some rights reserved (CC BY-NC)"],
  [47372, "Sequoia sempervirens", "coast redwood", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/140633325/medium.jpg', 47373, "(c) kaylamarie7718, some rights reserved (CC BY-NC)"],
  [18209, "Melanerpes formicivorus", "Acorn Woodpecker", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/3085/medium.jpg', 18158, "(c) Dmitry Mozzherin, some rights reserved (CC BY)"],
  [5206, "Buteo lineatus", "Red-shouldered Hawk", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/185927970/medium.jpg', 5179, "(c) spinomaly, some rights reserved (CC BY-NC)"],
  [9420, "Pipilo maculatus", "Spotted Towhee", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/30818274/medium.jpg', 9405, "(c) Greg Lasley, some rights reserved (CC BY-NC)"],
  [12937, "Sialia mexicana", "Western Bluebird", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/16748149/medium.jpg', 12935, "(c) uzun, some rights reserved (CC BY-NC)"],
  [47726, "Acer negundo", "box elder", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/486113480/medium.jpg', 47727, "(c) Jay Pruett, some rights reserved (CC BY)"],
  [792987, "Dryobates nuttallii", "Nuttall's Woodpecker", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/418403622/medium.jpg', 792976, "(c) Travis Cooper, some rights reserved (CC BY-NC-ND)"],
  [58231, "Platanus racemosa", "western sycamore", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/38512081/medium.jpg', 49664, "(c) Chris Cameron, some rights reserved (CC BY-NC)"],
  [180007, "Otospermophilus beecheyi", "California Ground Squirrel", 'Mammalia', 'inaturalist-open-data.s3.amazonaws.com/photos/1353651/medium.jpg', 179939, "(c) qli, some rights reserved (CC BY-NC)"],
  [5212, "Buteo jamaicensis", "Red-tailed Hawk", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/101327658/medium.jpg', 5179, "(c) Craig K. Hunt, some rights reserved (CC BY-NC)"],
  [27459, "Batrachoseps attenuatus", "California Slender Salamander", 'Amphibia', 'inaturalist-open-data.s3.amazonaws.com/photos/101853148/medium.jpg', 27444, "(c) Michael Spencer, some rights reserved (CC BY-NC)"],
  [48225, "Eschscholzia californica", "California poppy", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/67227218/medium.jpg', 48226, "(c) pronghornranch67, some rights reserved (CC BY-NC)"],
  [14801, "Sitta carolinensis", "White-breasted Nuthatch", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/30827676/medium.jpg', 14800, "(c) Mark McKnight, some rights reserved (CC BY-NC)"],
  [43112, "Sylvilagus bachmani", "Brush Rabbit", 'Mammalia', 'inaturalist-open-data.s3.amazonaws.com/photos/2882036/medium.jpg', 43096, "(c) Mike Patterson, some rights reserved (CC BY-NC)"],
  [7576, "Thryomanes bewickii", "Bewick's Wren", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/383579759/medium.jpg', 7575, "(c) Jen, some rights reserved (CC BY-NC)"],
  [53359, "Baccharis pilularis", "coyote brush", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/5362069/medium.jpg', 1073292, "(c) c michael hogan, some rights reserved (CC BY-NC-SA)"],
  [29044, "Pituophis catenifer", "Gopher Snake", 'Reptilia', 'inaturalist-open-data.s3.amazonaws.com/photos/389786008/medium.jpeg', 29033, "(c) Yinan Li, some rights reserved (CC BY-NC)"],
  [145245, "Setophaga coronata", "Yellow-rumped Warbler", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/128439522/medium.jpg', 10246, "(c) Zane Shantz, some rights reserved (CC BY-NC-ND)"],
  [7089, "Branta canadensis", "Canada Goose", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/239718896/medium.jpeg', 7086, "(c) Daniel LaFrance, some rights reserved (CC BY-NC)"],
  [42051, "Canis latrans", "Coyote", 'Mammalia', 'inaturalist-open-data.s3.amazonaws.com/photos/119738199/medium.jpg', 42044, "(c) ryan_krantz, some rights reserved (CC BY-NC)"],
  [73044, "Melozone crissalis", "California Towhee", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/1004/medium.jpg', 9522, "(c) Lucina M, some rights reserved (CC BY-NC)"],
  [12727, "Turdus migratorius", "American Robin", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/34859026/medium.jpg', 12705, "(c) John D Reynolds, some rights reserved (CC BY-NC)"],
  [19743, "Megascops kennicottii", "Western Screech-Owl", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/191641/medium.jpg', 19729, "(c) Greg Lasley, some rights reserved (CC BY-NC)"],
  [78699, "Populus trichocarpa", "black cottonwood", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/440702/medium.png', 47566, "(c) Thayne Tuason, some rights reserved (CC BY-NC)"],
  [54502, "Juglans hindsii", "northern California black walnut", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/23895906/medium.jpeg', 54495, "no rights reserved"],
  [143799, "Sambucus cerulea", "blue elder", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/136505248/medium.jpg', 52689, "(c) there_be_dragons, some rights reserved (CC BY-NC)"],
  [49011, "Quercus lobata", "valley oak", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/88494137/medium.jpeg', 47851, "(c) Andrea Kreuzhage, some rights reserved (CC BY-NC)"],
  [9176, "Zonotrichia leucophrys", "White-crowned Sparrow", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/27928/medium.jpg', 9175, "(c) Mike Baird, some rights reserved (CC BY)"],
  [8234, "Cyanocitta stelleri", "Steller's Jay", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/462234787/medium.jpg', 8228, "(c) Atlee Hargis, some rights reserved (CC BY-NC)"],
  [906, "Meleagris gallopavo", "Wild Turkey", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/31353610/medium.jpg', 905, "(c) Matt K, some rights reserved (CC BY-NC)"],
  [777371, "Diplacus aurantiacus", "orange bush monkeyflower", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/18817746/medium.jpg', 777236, "(c) Mike Andersen, some rights reserved (CC BY-NC-ND)"],
  [4956, "Ardea herodias", "Great Blue Heron", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/65060931/medium.jpg', 4950, "(c) Dan Roach, some rights reserved (CC BY-NC)"],
  [14886, "Mimus polyglottos", "Northern Mockingbird", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/142697277/medium.jpg', 14877, "(c) Kevin Milazzo, some rights reserved (CC BY-NC-SA)"],
  [244216, "Xylocopa sonorina", "Valley Carpenter Bee", 'Insecta', 'inaturalist-open-data.s3.amazonaws.com/photos/25065/medium.jpg', 557049, "(c) stonebird, some rights reserved (CC BY-NC-SA)"],
  [7266, "Psaltriparus minimus", "Bushtit", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/111125701/medium.jpg', 7265, "(c) Kevin Krebs, some rights reserved (CC BY-NC-SA)"],
  [56534, "Clathrus ruber", "red-cage fungus", 'Fungi', 'inaturalist-open-data.s3.amazonaws.com/photos/166/medium.jpg', 51137, "(c) Dave Gough, some rights reserved (CC BY)"],
  [47226, "Papilio rutulus", "Western Tiger Swallowtail", 'Insecta', 'inaturalist-open-data.s3.amazonaws.com/photos/18957208/medium.jpg', 545186, "(c) Tom Benson, some rights reserved (CC BY-NC-ND)"],
  [48484, "Harmonia axyridis", "Asian Lady Beetle", 'Insecta', 'inaturalist-open-data.s3.amazonaws.com/photos/30978499/medium.jpg', 48487, "(c) Paolo Mazzei, some rights reserved (CC BY-NC)"],
  [506118, "Aphelocoma californica", "California Scrub-Jay", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/52796822/medium.jpg', 7824, "(c) Matt K, some rights reserved (CC BY-NC)"],
  [20044, "Bubo virginianus", "Great Horned Owl", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/14549085/medium.jpg', 20034, "(c) Paul G. Johnson, algunos derechos reservados (CC BY-NC-SA), subido por Paul G. Johnson"],
  [47817, "Libellula saturata", "Flame Skimmer", 'Insecta', 'inaturalist-open-data.s3.amazonaws.com/photos/1610104/medium.jpg', 47818, "(c) Diana-Terry Hibbitts, some rights reserved (CC BY-NC)"],
  [7428, "Bombycilla cedrorum", "Cedar Waxwing", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/450146514/medium.jpeg', 7427, "(c) Manny Salas, some rights reserved (CC BY-NC)"],
  [18236, "Colaptes auratus", "Northern Flicker", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/123812445/medium.jpg', 18230, "(c) Kala Murphy King, some rights reserved (CC BY-NC-ND)"],
  [57354, "Schinus molle", "Peruvian Pepper Tree", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/382465760/medium.jpeg', 57355, "(c) altagray, some rights reserved (CC BY-NC)"],
  [4756, "Cathartes aura", "Turkey Vulture", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/52277010/medium.jpg', 4755, "(c) Seig, some rights reserved (CC BY)"],
  [7109, "Lophodytes cucullatus", "Hooded Merganser", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/338791340/medium.jpg', 7108, "(c) Jason Stovin, some rights reserved (CC BY-NC)"],
  [48807, "Umbellularia californica", "California bay", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/264601982/medium.jpg', 48810, "(c) Nido Paras, some rights reserved (CC BY-NC)"],
  [57250, "Prunus ilicifolia", "hollyleaf cherry", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/49953932/medium.jpg', 47351, "(c) rappman, some rights reserved (CC BY)"],
  [64133, "Salvia spathacea", "Hummingbird Sage", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/526697773/medium.jpg', 1487166, "(c) fritillariabiflora, some rights reserved (CC BY-NC)"],
  [4981, "Nycticorax nycticorax", "Black-crowned Night Heron", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/49357930/medium.jpg', 4979, "no rights reserved"],
  [9319, "Icterus cucullatus", "Hooded Oriole", 'Aves', 'inaturalist-open-data.s3.amazonaws.com/photos/26732/medium.jpg', 9315, "(c) Nick Chill, some rights reserved (CC BY-NC-SA)"],
  [53452, "Salix lasiolepis", "Arroyo Willow", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/16056750/medium.jpg', 53453, "(c) Tom Turner, some rights reserved (CC BY-NC)"],
  [143792, "Pistacia chinensis", "Chinese pistache", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/171142/medium.jpg', 72301, "(c) 潘立傑 LiChieh Pan, some rights reserved (CC BY-NC-SA)"],
  [64350, "Ginkgo biloba", "ginkgo", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/397250612/medium.jpeg', 64355, "(c) 鐦鍆錒/锎钔锕（Man Hoimoon）, some rights reserved (CC BY-NC)"],
  [53351, "Alnus rhombifolia", "white alder", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/55405328/medium.jpeg', 53352, "(c) Lauren Glevanik, some rights reserved (CC BY-NC)"],
  [82689, "Arbutus unedo", "strawberry tree", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/587076789/medium.jpg', 51047, "(c) Jacques HALLOT, some rights reserved (CC BY-NC)"],
  [82722, "Pinus halepensis", "Aleppo pine", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/169135495/medium.jpeg', 47561, "(c) Σάββας Ζαφειρίου (Savvas Zafeiriou), some rights reserved (CC BY-NC)"],
  [76949, "Eriobotrya japonica", "Loquat", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/34746885/medium.jpg', 72119, "(c) ms_starla, some rights reserved (CC BY-NC)"],
  [63935, "Juglans regia", "Persian walnut", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/146867462/medium.jpg', 54495, "(c) Ed Alverson, some rights reserved (CC BY)"],
  [63512, "Acer palmatum", "Japanese maple", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/5641007/medium.jpg', 47727, "(c) Katja Schulz, some rights reserved (CC BY)"],
  [59556, "Cercis occidentalis", "Western Redbud", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/186630694/medium.jpg', 48801, "(c) Orenda Randuch, some rights reserved (CC BY-NC)"],
  [135394, "Lagerstroemia indica", "Crape-myrtle", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/203337469/medium.jpeg', 68717, "(c) Rich_Yang, some rights reserved (CC BY-NC)"],
  [119793, "Pyrus calleryana", "Callery pear", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/269351075/medium.jpg', 58736, "(c) Benjamin Smith, some rights reserved (CC BY)"],
  [77976, "Melaleuca citrina", "crimson bottlebrush", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/167238830/medium.jpeg', 72232, "(c) John Eichler, some rights reserved (CC BY-NC)"],
  [49919, "Quercus kelloggii", "California black oak", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/25409011/medium.jpeg', 47851, "no rights reserved"],
  [49658, "Liquidambar styraciflua", "American sweetgum", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/239888168/medium.jpeg', 49661, "(c) Randy Puckett, some rights reserved (CC BY-NC)"],
  [79521, "Washingtonia robusta", "Mexican Fan Palm", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/249270666/medium.jpeg', 50185, "(c) itazura, some rights reserved (CC BY-NC)"],
  [83074, "Magnolia grandiflora", "southern magnolia", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/82254330/medium.jpg', 82096, "(c) 潘立傑 LiChieh Pan, some rights reserved (CC BY-NC-SA)"],
  [57140, "Olea europaea", "Olive", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/71271675/medium.jpeg', 57145, "(c) Alan Dandie, some rights reserved (CC BY-NC)"],
  [48256, "Pseudotsuga menziesii", "Douglas-fir", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/140217013/medium.jpg', 48257, "(c) Tracy S., some rights reserved (CC BY-NC)"],
  [79462, "Ulmus parvifolia", "Chinese elm", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/231455411/medium.jpeg', 53549, "(c) Reid Hardin, some rights reserved (CC BY)"],
  [69820, "Cedrus deodara", "Deodar cedar", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/666318631/medium.jpg', 69821, "(c) Azan Khan, some rights reserved (CC BY-NC)"],
  [53421, "Pinus radiata", "Monterey pine", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/168316058/medium.jpg', 47561, "(c) Jeff Bisbee, some rights reserved (CC BY-NC)"],
  [77378, "Hesperocyparis macrocarpa", "Monterey Cypress", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/184809375/medium.jpeg', 325545, "(c) jriebe2016, some rights reserved (CC BY-NC)"],
  [51046, "Arbutus menziesii", "Pacific madrone", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/8268086/medium.jpg', 51047, "(c) Dee Warenycia, some rights reserved (CC BY-NC)"],
  [49005, "Quercus rubra", "northern red oak", 'Plantae', 'inaturalist-open-data.s3.amazonaws.com/photos/96523422/medium.jpeg', 47851, "(c) ssimeto, some rights reserved (CC BY-NC)"],
].map(([id, name, common, iconic, photo, genus, credit]) => [id, { id, name, common, iconic, rank: 'species', genus, ancestors: [genus], photo: `https://${photo}`, credit }]));

// Sample people. Each has a profile (tap their name or avatar on a post): level, places they've
// explored, the species in their collection (TAXA ids) and activity counts. Their achievements are
// worked out from those with the same rules as yours (account.js), so nobody shows a badge their
// collection couldn't actually earn.
const ALL = Object.keys(TAXA).map(Number);
const pick = (from, n, offset = 0) => Array.from({ length: n }, (_, i) => from[(i * 7 + offset) % from.length]).filter((v, i, a) => a.indexOf(v) === i);
// Trees in order of how often they are recorded around De Anza College (TAXA keys sort by id, not by this).
const TREES = [47850, 53348, 53405, 47372, 47726, 58231, 78699, 143799, 54502, 49011, 57250, 57354, 48807, 53452, 143792, 64350,
  53351, 82689, 82722, 76949, 63935, 63512, 59556, 135394, 119793, 77976, 49919, 49658, 79521, 83074, 57140, 48256, 79462, 69820,
  53421, 77378, 51046, 49005];
const BIRDS = ALL.filter(id => TAXA[id].iconic === 'Aves');
const OTHERS = ALL.filter(id => !isTree(TAXA[id]));
// Introduced here (for the "Invader alert" badge): honey bee, Bermuda buttercup, gray squirrel, lady beetle and planted trees.
export const NON_NATIVE = new Set([47219, 53169, 57354, 143792, 64350, 82689, 82722, 76949, 63935, 63512, 135394, 119793, 77976,
  49658, 79521, 83074, 57140, 79462, 69820, 49005, 46017, 48484]);
const USERS = {
  maya: { name: 'Maya R.', avatar: '🐦', color: '#2b8595', level: 9, since: '2024-03', places: ['rancho', 'shoreline', 'baylands', 'deanza', 'vasona'],
    dex: [...pick(BIRDS, 34, 1), ...TREES.slice(0, 4)], activity: { streak: 9, ai: 12, shared: 6, rare: 3, veryRare: 0, campus: 4 } },
  diego: { name: 'Diego Alvarez', avatar: '🌲', color: '#2f6b3f', level: 6, since: '2024-09', places: ['stevens', 'picchetti', 'deanza'],
    dex: [...TREES.slice(0, 20), ...pick(OTHERS, 10, 3)], activity: { streak: 4, ai: 8, shared: 3, rare: 0, veryRare: 0, campus: 14 } },
  ken: { name: 'trailrunner_ken', avatar: '🏃', color: '#c47f12', level: 5, since: '2025-01', places: ['fremontOlder', 'rancho', 'picchetti', 'stevens'],
    dex: [...pick(OTHERS, 16, 5), ...TREES.slice(0, 5)], activity: { streak: 2, ai: 0, shared: 4, rare: 2, veryRare: 1, campus: 0 } },
  priya: { name: 'Priya S.', avatar: '🦋', color: '#bd2f6a', level: 4, since: '2025-04', places: ['mcclellan', 'blackberry', 'deanza'],
    dex: [48662, 47226, 47219, 244216, 47817, 48484, ...pick(OTHERS, 6, 2), ...TREES.slice(2, 8)], activity: { streak: 3, ai: 5, shared: 3, rare: 2, veryRare: 0, campus: 11 } },
  sam: { name: 'sam.outdoors', avatar: '🥾', color: '#8a5a2b', level: 3, since: '2025-06', places: ['rancho', 'fremontOlder'],
    dex: [...pick(OTHERS, 7, 4), ...TREES.slice(0, 2)], activity: { streak: 1, ai: 2, shared: 2, rare: 0, veryRare: 0, campus: 0 } },
  lena: { name: 'Lena W.', avatar: '🌼', color: '#6a4fb3', level: 4, since: '2025-02', places: ['memorial', 'blackberry', 'deanza'],
    dex: [48225, 777371, 64133, 53359, 53169, ...TREES.slice(0, 9), ...pick(OTHERS, 4, 6)], activity: { streak: 2, ai: 6, shared: 3, rare: 0, veryRare: 0, campus: 9 } },
  owen: { name: 'Owen K.', avatar: '🛶', color: '#3b6fb6', level: 5, since: '2024-11', places: ['vasona', 'reservoir', 'shoreline', 'baylands'],
    dex: [7109, 4981, 4956, 6930, 7089, ...pick(BIRDS, 12, 3), 53452, 78699, 53351], activity: { streak: 5, ai: 3, shared: 3, rare: 1, veryRare: 1, campus: 0 } },
  fungi: { name: 'FungiFinder', avatar: '🍄', color: '#7a4e2d', level: 3, since: '2025-05', places: ['rancho', 'stevens'],
    dex: [56534, ...pick(OTHERS, 5, 1), 47850, 48807, 47372], activity: { streak: 2, ai: 1, shared: 2, rare: 1, veryRare: 0, campus: 0 } },
  ava: { name: 'Ava T.', avatar: '🌳', color: '#4f6b3a', level: 7, since: '2025-08', places: ['deanza', 'memorial', 'stevens'],
    dex: [...TREES.slice(0, 32), ...pick(OTHERS, 10, 2)], activity: { streak: 6, ai: 30, shared: 4, rare: 2, veryRare: 0, campus: 41 } },
  marcus: { name: 'Marcus L.', avatar: '📷', color: '#b4532f', level: 6, since: '2024-12', places: ['rancho', 'shoreline', 'deanza', 'baylands', 'vasona'],
    dex: [...pick(OTHERS, 22, 4), ...TREES.slice(0, 7)], activity: { streak: 3, ai: 9, shared: 5, rare: 2, veryRare: 0, campus: 6 } },
  jun: { name: 'Jun P.', avatar: '🦎', color: '#2b8595', level: 3, since: '2025-07', places: ['stevens', 'picchetti'],
    dex: [36204, 29044, 27459, 56534, ...pick(OTHERS, 5, 3), 47850, 53348], activity: { streak: 2, ai: 2, shared: 2, rare: 0, veryRare: 0, campus: 0 } },
  rosa: { name: 'Rosa M.', avatar: '🌺', color: '#bd2f6a', level: 2, since: '2025-09', places: ['memorial', 'blackberry'],
    dex: [48225, 64133, 6317, ...pick(OTHERS, 3, 5), 83074, 135394], activity: { streak: 1, ai: 1, shared: 1, rare: 0, veryRare: 0, campus: 0 } },
  ecoclub: { name: 'De Anza Eco Club', avatar: '🎓', color: '#2f5e40', level: 8, since: '2024-08', places: ['deanza', 'stevens', 'rancho', 'shoreline'],
    dex: [...TREES, ...pick(OTHERS, 30, 1)], activity: { streak: 12, ai: 60, shared: 9, rare: 4, veryRare: 1, campus: 96 } },
};


export const SAMPLE_PLACES = {
  rancho: { place: 'Rancho San Antonio', lat: 37.33, lng: -122.09 },
  stevens: { place: 'Stevens Creek County Park', lat: 37.30, lng: -122.08 },
  fremontOlder: { place: 'Fremont Older Preserve', lat: 37.29, lng: -122.06 },
  mcclellan: { place: 'McClellan Ranch Preserve', lat: 37.31, lng: -122.07 },
  blackberry: { place: 'Blackberry Farm', lat: 37.32, lng: -122.06 },
  deanza: { place: 'De Anza College', lat: 37.32, lng: -122.05 },
  shoreline: { place: 'Shoreline Park', lat: 37.43, lng: -122.08 },
  vasona: { place: 'Vasona Lake County Park', lat: 37.24, lng: -121.97 },
  reservoir: { place: 'Stevens Creek Reservoir', lat: 37.30, lng: -122.07 },
  memorial: { place: 'Cupertino Memorial Park', lat: 37.33, lng: -122.04 },
  picchetti: { place: 'Picchetti Ranch', lat: 37.29, lng: -122.09 },
  baylands: { place: 'Palo Alto Baylands', lat: 37.46, lng: -122.11 },
};

// Achievements from the same rules as yours: stats are built from each person's collection and places.
function earned(u) {
  const taxa = u.dex.map(id => TAXA[id]);
  const groups = {};
  for (const t of taxa) groups[groupOf(t.iconic)] = (groups[groupOf(t.iconic)] || 0) + 1;
  const spots = [];
  for (const p of u.places.map(k => SAMPLE_PLACES[k])) if (spots.every(q => haversineKm(p, q) >= 5)) spots.push(p);
  const a = u.activity;
  const stats = {
    count: taxa.length + a.ai, species: taxa.length, groups, groupCount: Object.keys(groups).filter(g => g !== 'other').length,
    trees: taxa.filter(isTree).length, oaks: taxa.filter(isOak).length, conifers: taxa.filter(isConifer).length,
    dex: taxa.length, places: spots.length, level: u.level, campus: u.places.includes('deanza') ? a.campus : 0,
    nonNative: taxa.filter(t => NON_NATIVE.has(t.id)).length, rare: a.rare + a.veryRare, veryRare: a.veryRare,
    bestStreak: a.streak, ai: a.ai, shared: a.shared,
  };
  return ACHIEVEMENTS.filter(x => x.value(stats) >= x.goal).map(x => x.id);
}
export const SAMPLE_USERS = Object.fromEntries(Object.entries(USERS).map(([key, u]) => [key, { ...u, key, achievements: earned(u) }]));

const photo = id => `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/medium.jpg`;

const RAW = [
  { user: 'maya', hoursAgo: 1.2, at: 'rancho', likes: 14, tier: 'uncommon',
    taxon: { id: 12937, name: 'Sialia mexicana', common: 'Western Bluebird', iconic: 'Aves' },
    caption: 'A pair of bluebirds hopping along the fence by the farm. Brightest blue I’ve seen all year!',
    photoUrl: null, credit: '(c) uzun, some rights reserved (CC BY-NC)' },
  { user: 'ken', hoursAgo: 3.5, at: 'fremontOlder', likes: 41, tier: 'veryrare',
    taxon: { id: 41976, name: 'Lynx rufus', common: 'Bobcat', iconic: 'Mammalia' },
    caption: 'Crossed the trail maybe 20 ft ahead of me at dawn. Stopped, stared, and strolled off 😮',
    photoUrl: null, credit: '(c) Kala Murphy King, some rights reserved (CC BY-NC-ND)' },
  { user: 'lena', hoursAgo: 5, at: 'deanza', likes: 6, tier: 'common',
    taxon: { id: 48225, name: 'Eschscholzia californica', common: 'California Poppy', iconic: 'Plantae' },
    caption: 'Still blooming by the campus garden in October.',
    photoUrl: null, credit: '(c) pronghornranch67, some rights reserved (CC BY-NC)' },
  { user: 'priya', hoursAgo: 7, at: 'mcclellan', likes: 23, tier: 'rare',
    taxon: { id: 48662, name: 'Danaus plexippus', common: 'Monarch', iconic: 'Insecta' },
    caption: 'Nectaring on the milkweed patch. Fingers crossed for more this fall.',
    photoUrl: null, credit: '(c) Alejandro Lopez, some rights reserved (CC BY-NC-SA)' },
  { user: 'diego', hoursAgo: 9, at: 'stevens', likes: 11, tier: 'common',
    taxon: { id: 18209, name: 'Melanerpes formicivorus', common: 'Acorn Woodpecker', iconic: 'Aves' },
    caption: 'Found their granary tree, with hundreds of acorns packed in.',
    photoUrl: null, credit: '(c) Dmitry Mozzherin, some rights reserved (CC BY)' },
  { user: 'sam', hoursAgo: 20, at: 'picchetti', likes: 9, tier: 'uncommon',
    taxon: { id: 47776, name: 'Ariolimax columbianus', common: 'Pacific Banana Slug', iconic: 'Mollusca' },
    caption: 'Almost stepped on this one after the drizzle.',
    photoUrl: null, credit: '(c) ritchie, some rights reserved (CC BY-NC)' },
  { user: 'fungi', hoursAgo: 26, at: 'blackberry', likes: 7, tier: 'uncommon',
    taxon: { id: 1153556, name: 'Trametes versicolor', common: 'Turkey Tail', iconic: 'Fungi' },
    caption: 'First flush of the season on a fallen oak branch.',
    photoUrl: null, credit: 'no rights reserved (CC0), uploaded by Ken Kneidel' },
  { user: 'owen', hoursAgo: 30, at: 'vasona', likes: 12, tier: 'uncommon',
    taxon: { id: 4956, name: 'Ardea herodias', common: 'Great Blue Heron', iconic: 'Aves' },
    caption: 'Patiently fishing the shallows. Caught something on the third try.',
    photoUrl: null, credit: '(c) Dan Roach, some rights reserved (CC BY-NC)' },
  { user: 'maya', hoursAgo: 34, at: 'rancho', likes: 4, tier: 'common',
    taxon: { id: 36204, name: 'Sceloporus occidentalis', common: 'Western Fence Lizard', iconic: 'Reptilia' },
    caption: 'Doing push-ups on a sunny rock. Classic.',
    photoUrl: null, credit: '(c) Steven Kurniawidjaja, some rights reserved (CC BY-NC)' },
  { user: 'ken', hoursAgo: 46, at: 'rancho', likes: 28, tier: 'rare',
    taxon: { id: 42076, name: 'Urocyon cinereoargenteus', common: 'Gray Fox', iconic: 'Mammalia' },
    caption: 'Gray fox at dusk near the Wildcat Loop trailhead.',
    photoUrl: photo(41795717), credit: '(c) Delmar W. Bachert, some rights reserved (CC BY-NC)' },
  { user: 'priya', hoursAgo: 52, at: 'reservoir', likes: 15, tier: 'rare',
    taxon: { id: 27818, name: 'Taricha torosa', common: 'California Newt', iconic: 'Amphibia' },
    caption: 'Early mover! I usually don’t see these until the rains.',
    photoUrl: photo(2964), credit: '(c) ap2il, some rights reserved (CC BY-NC)' },
  { user: 'lena', hoursAgo: 60, at: 'memorial', likes: 10, tier: 'common',
    taxon: { id: 6317, name: 'Calypte anna', common: 'Anna’s Hummingbird', iconic: 'Aves' },
    caption: 'Male flashing his pink throat at everyone who walked by.',
    photoUrl: photo(4856611), credit: '(c) Robin Gwen Agarwal, some rights reserved (CC BY-NC)' },
  { user: 'owen', hoursAgo: 75, at: 'shoreline', likes: 37, tier: 'veryrare',
    taxon: { id: 19975, name: 'Athene cunicularia', common: 'Burrowing Owl', iconic: 'Aves' },
    caption: 'One of the few left here. Watched from the path with binoculars and kept my distance.',
    photoUrl: photo(21040564), credit: '(c) Deb Graham Whitecotton, some rights reserved (CC BY-NC)' },
  { user: 'diego', hoursAgo: 90, at: 'baylands', likes: 5, tier: 'common',
    taxon: { id: 5212, name: 'Buteo jamaicensis', common: 'Red-tailed Hawk', iconic: 'Aves' },
    caption: 'Riding the thermals over the marsh.',
    photoUrl: null, credit: '(c) Craig K. Hunt, some rights reserved (CC BY-NC)' },
  { user: 'sam', hoursAgo: 110, at: 'picchetti', likes: 8, tier: 'common',
    taxon: { id: 42220, name: 'Odocoileus hemionus', common: 'Mule Deer', iconic: 'Mammalia' },
    caption: 'Doe and fawn grazing near the old vineyard.',
    photoUrl: null, credit: '(c) Marshal Hedin, some rights reserved (CC BY-NC-SA)' },
  { user: 'priya', hoursAgo: 130, at: 'mcclellan', likes: 9, tier: 'uncommon',
    taxon: { id: 47226, name: 'Papilio rutulus', common: 'Western Tiger Swallowtail', iconic: 'Insecta' },
    caption: 'Huge swallowtail working the butterfly bush.',
    photoUrl: null, credit: '(c) Tom Benson, some rights reserved (CC BY-NC-ND)' },
];

// More posts in short form: [user, hours ago, place, likes, tier, TAXA id, caption].
const MORE = [
  ['ava', 2.1, 'deanza', 22, 'common', 47850, 'The huge coast live oak by the library. Nature Radar got it from a wide shot of the whole tree!'],
  ['ecoclub', 5, 'deanza', 35, 'common', 47372, 'Campus redwood grove walk today: 14 people, 31 species logged. Thanks for coming!'],
  ['marcus', 9, 'rancho', 57, 'rare', 20044, 'Great horned owl roosting in the oaks above the Wildcat Canyon trail. Look up!'],
  ['jun', 14, 'stevens', 11, 'common', 36204, 'Fence lizards doing push-ups on every rock by the creek.'],
  ['ava', 20, 'deanza', 18, 'uncommon', 49011, 'Valley oak near the Flint Center. These can live for 600 years.'],
  ['rosa', 27, 'memorial', 13, 'common', 6317, 'Anna’s hummingbird guarding the feeder like it owns the park.'],
  ['ecoclub', 31, 'deanza', 26, 'common', 58231, 'Western sycamores are dropping their leaves. Great time to collect a tree for your dex 🌳'],
  ['owen', 44, 'vasona', 19, 'uncommon', 7109, 'Hooded mergansers are back on the lake for winter.'],
  ['fungi', 52, 'rancho', 30, 'rare', 56534, 'Red-cage fungus after the rain. Smells terrible, looks amazing.'],
  ['jun', 60, 'picchetti', 16, 'uncommon', 29044, 'Gopher snake crossing the fire road. Harmless and very chill.'],
  ['marcus', 75, 'shoreline', 21, 'uncommon', 4981, 'Night heron hunched by the lake at dusk.'],
  ['lena', 88, 'deanza', 12, 'common', 53348, 'California buckeye already losing its leaves (it does that every summer to save water).'],
  ['sam', 101, 'fremontOlder', 24, 'uncommon', 42051, 'Coyote trotting along the ridge, totally ignoring us.'],
  ['diego', 120, 'stevens', 15, 'common', 48807, 'Crush a California bay leaf and smell it. Way stronger than the store-bought kind.'],
];
RAW.push(...MORE.map(([user, hoursAgo, at, likes, tier, id, caption]) => ({
  user, hoursAgo, at, likes, tier, taxon: TAXA[id], caption, photoUrl: TAXA[id].photo, credit: TAXA[id].credit,
})));

// Default iNaturalist photos for the posts above that didn't set one.
const DEFAULT_PHOTOS = {
  12937: 'https://inaturalist-open-data.s3.amazonaws.com/photos/16748149/medium.jpg', 41976: 'https://inaturalist-open-data.s3.amazonaws.com/photos/60028871/medium.jpg', 48225: 'https://inaturalist-open-data.s3.amazonaws.com/photos/67227218/medium.jpg', 48662: 'https://inaturalist-open-data.s3.amazonaws.com/photos/227923335/medium.jpeg', 18209: 'https://inaturalist-open-data.s3.amazonaws.com/photos/3085/medium.jpg',
  47776: 'https://inaturalist-open-data.s3.amazonaws.com/photos/59264526/medium.jpeg', 1153556: 'https://inaturalist-open-data.s3.amazonaws.com/photos/27005174/medium.jpg', 4956: 'https://inaturalist-open-data.s3.amazonaws.com/photos/65060931/medium.jpg', 36204: 'https://inaturalist-open-data.s3.amazonaws.com/photos/36416485/medium.jpeg', 5212: 'https://inaturalist-open-data.s3.amazonaws.com/photos/101327658/medium.jpg',
  42220: 'https://inaturalist-open-data.s3.amazonaws.com/photos/5207830/medium.jpg', 47226: 'https://inaturalist-open-data.s3.amazonaws.com/photos/18957208/medium.jpg',
};

export const SAMPLE_POSTS = RAW.map((p, i) => ({
  id: `sample-${i + 1}`,
  author: SAMPLE_USERS[p.user],
  ...SAMPLE_PLACES[p.at],
  hoursAgo: p.hoursAgo,
  likes: p.likes,
  tier: p.tier,
  rarity: null,
  iconic: p.taxon.iconic,
  taxon: p.taxon,
  caption: p.caption,
  photoUrl: p.photoUrl || DEFAULT_PHOTOS[p.taxon.id],
  credit: p.credit,
}));
