using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

// Test-only harness. It cannot accept an external server or arbitrary database.
const string signingKey="LOCAL-SYNTHETIC-SOLO-E2E-KEY-NEVER-USE-IN-PRODUCTION";
var root=Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../../.."));
var statePath=Path.Combine(root,"artifacts/solo-operator-mode/local-e2e/state.json");
string database;
if(args.FirstOrDefault()=="cleanup")
{
    using var state=JsonDocument.Parse(await File.ReadAllTextAsync(statePath));database=state.RootElement.GetProperty("database").GetString()!;
}
else database="MyPetLinkTest_SoloOperator_"+Guid.NewGuid().ToString("N");
if(!Regex.IsMatch(database,@"^MyPetLinkTest_SoloOperator_[a-f0-9]{32}$"))throw new InvalidOperationException("Disposable database guard refused the name.");
var connection=$"Server=(localdb)\\MSSQLLocalDB;Database={database};Trusted_Connection=True;TrustServerCertificate=True;";
await using var db=new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>().UseSqlServer(connection).Options);
if(args.FirstOrDefault()=="cleanup") {await db.Database.EnsureDeletedAsync();Console.WriteLine("Deleted only owned disposable database "+database);return;}
await db.Database.MigrateAsync();
var users=Enumerable.Range(1,3).Select(i=>new User {Email=$"solo-e2e-{i}@mypetlink.local",NormalizedEmail=$"SOLO-E2E-{i}@MYPETLINK.LOCAL",DisplayName=$"Synthetic Operator {i}",Status=UserStatus.Active}).ToArray();
foreach(var u in users)u.AdminUser=new AdminUser {User=u,UserId=u.Id,IsActive=true};
var role=new AdminRoleDefinition {Code="synthetic-e2e-all",Name="Synthetic E2E operators",GrantsAllCapabilities=true};
foreach(var u in users)role.Assignments.Add(new AdminUserRoleAssignment {AdminUserId=u.AdminUser!.Id});
db.Users.AddRange(users);db.AdminRoles.Add(role);
var merchant=new Merchant {MerchantCode="QA-REMEDIATION",LegalBusinessName="Synthetic Consignment Shop",ContactPerson="Synthetic Shop Contact",ContactEmail="shop@mypetlink.local",ContactPhone="+60123456789",BillingAddressLine1="1 Synthetic Street",BillingPostcode="50000",BillingCity="Kuala Lumpur",BillingState="Kuala Lumpur",DeliveryAddressLine1="1 Synthetic Street",DeliveryCity="Kuala Lumpur",DeliveryState="Kuala Lumpur",DeliveryPostcode="50000",IsActive=true};
var branch=new MerchantBranch {Merchant=merchant,Name="Synthetic main branch",AddressLine1="1 Synthetic Street",Postcode="50000",City="Kuala Lumpur",State="Kuala Lumpur",Country="Malaysia",IsActive=true};
var product=new TagProduct {Name="Synthetic QR + NFC Smart Tag",Slug="synthetic-remediation",IsPublished=true};
var variant=new TagProductVariant {TagProduct=product,PublicKey="synthetic-remediation-standard",Sku="QA-REMEDIATION-NFC",DisplayName="Standard",SupportsQr=true,SupportsNfc=true,TagVariant="Standard",IsActive=true,IsPurchasable=true,BasePrice=39.90m,Currency="MYR",WeightGrams=12};
var receipt=new InventoryReceipt {ReceiptNumber="QA-REMEDIATION-RECEIPT",TagProductVariant=variant,QuantityReceived=6,ReceivedAt=DateTimeOffset.UtcNow,CreatedByAdminUserId=users[0].AdminUser!.Id,PurchaseCurrency="MYR",ExchangeRateToMyr=1,GoodsCost=18,TotalLandedCostMyr=18,UnitLandedCostMyr=3};
db.AddRange(branch,variant,receipt);
foreach(var suffix in new[]{"AAAA","AAAB","AAAC","AAAD","AAAE","AAAF"})db.SmartTags.Add(new SmartTag {TagCode="MPL-TEST-"+suffix,ProductVariant=variant,InventoryReceipt=receipt,HasNfc=true,Variant="Standard",StockPurpose=SmartTagStockPurpose.Sale,QaStatus=PhysicalQaStatus.Passed,QaVersion=1,FulfilmentStatus=TagFulfilmentStatus.Printed,Status=SmartTagStatus.Unclaimed});
var identity=await db.BusinessIdentitySettings.SingleAsync();identity.LegalBusinessName="Synthetic Test Seller";identity.BrandName="MyPetLink";identity.BusinessRegistrationNumber="SYNTHETIC-ONLY";identity.RegisteredAddressLine1="1 Synthetic Seller Street";identity.RegisteredPostcode="50000";identity.RegisteredCity="Kuala Lumpur";identity.RegisteredState="Kuala Lumpur";identity.RegisteredCountry="Malaysia";identity.SupportEmail="support@mypetlink.local";
await db.SaveChangesAsync();
object Session(User u)
{
    var token=new JwtSecurityToken("MyPetLink.Api","MyPetLink.Local",[new Claim(JwtRegisteredClaimNames.Sub,u.Id.ToString())],expires:DateTime.UtcNow.AddHours(2),signingCredentials:new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),SecurityAlgorithms.HmacSha256));
    return new {accessToken=new JwtSecurityTokenHandler().WriteToken(token),refreshToken="synthetic-not-used",expiresAt=DateTimeOffset.UtcNow.AddHours(2).ToUnixTimeMilliseconds(),user=new {id=u.Id,email=u.Email,displayName=u.DisplayName,roles=new[]{"Admin"},status="Active"}};
}
await File.WriteAllTextAsync(statePath,JsonSerializer.Serialize(new {database,connection,merchantId=merchant.Id,branchId=branch.Id,variantId=variant.Id,destination=MyPetLink.Api.Services.ConsignmentService.BranchDestination(branch),sessions=users.Select(Session).ToArray()},new JsonSerializerOptions {WriteIndented=true}));
Console.WriteLine("Seeded owned disposable database "+database+". Three synthetic operators; six synthetic tags; no financial orders.");
