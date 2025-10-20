using System.IO.Pipelines;

namespace OneLakeOpenMirroringExample.Storage
{
    internal class ProducerConsumer
    {
        public static async Task StreamAsync(Func<Stream, Task> producerAsync, Func<Stream, Task> consumerAsync)
        {
            var pipe = new Pipe();

            await Task.WhenAll(
                Task.Run(async () =>
                {
                    await producerAsync(pipe.Writer.AsStream());
                    await pipe.Writer.CompleteAsync();
                }),
                Task.Run(async () =>
                {
                    await consumerAsync(pipe.Reader.AsStream());
                })
            );
        }
    }
}
